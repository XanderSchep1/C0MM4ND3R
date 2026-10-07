import { readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Guards the whole JSON API at once. Every route file under src/app/api is
// discovered automatically, so a new endpoint that forgets to check the session
// (or to scope its deck lookup to the signed-in user) fails here.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));

// Stands in for the database. Anything not listed throws, which is how the first
// test proves no route reads or writes data before it has authenticated.
vi.mock("@/lib/prisma", () => {
  const allowed: Record<string, unknown> = {
    deck: { findFirst: mocks.deckFindFirst },
    // hitRateLimit: one counter row per call, never over the limit.
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  };
  return {
    prisma: new Proxy(allowed, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        throw new Error(`prisma.${prop} was used where only a deck lookup was expected`);
      },
    }),
  };
});

const API_DIR = path.resolve(import.meta.dirname);

// A deck lookup is safe if it can only match decks this user owns, or (for the few read-only routes a
// friend may use) decks this user was invited to. Anything looser (no user in the filter) fails.
function reachableOnlyBy(where: { userId?: string; OR?: { userId?: string; collaborators?: { some?: { userId?: string } } }[] }, userId: string): boolean {
  if (where.userId === userId) return true;
  return Array.isArray(where.OR) && where.OR.length > 0 && where.OR.every((clause) => clause.userId === userId || clause.collaborators?.some?.userId === userId);
}
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

// NextAuth's own catch-all handler does its own session logic.
const routeFiles = findRouteFiles(API_DIR)
  .filter((file) => !file.includes(`${path.sep}auth${path.sep}`))
  .sort();

const context = { params: Promise.resolve({ id: "deck-1" }) };

function request(method: string): Request {
  const init: RequestInit = { method };
  if (method !== "GET" && method !== "DELETE") {
    init.body = "{}";
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost/api/test?q=sol&deckId=deck-1", init);
}

async function handlersOf(file: string) {
  const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
  return METHODS.filter((m) => typeof mod[m] === "function").map((m) => ({ method: m, handler: mod[m] as (req: Request, ctx: typeof context) => Promise<Response> }));
}

describe("API routes", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.deckFindFirst.mockReset();
  });

  it("finds the route files", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  describe.each(routeFiles.map((file) => [path.relative(API_DIR, file), file]))("%s", (_name, file) => {
    it("rejects anonymous requests with 401 before touching the database", async () => {
      mocks.auth.mockResolvedValue(null);
      const handlers = await handlersOf(file);
      expect(handlers.length).toBeGreaterThan(0);
      for (const { method, handler } of handlers) {
        const res = await handler(request(method), context);
        expect(res.status, `${method} should require a session`).toBe(401);
      }
    });

    it("rejects a session without a user id", async () => {
      mocks.auth.mockResolvedValue({ user: { email: "someone@example.com" } });
      for (const { method, handler } of await handlersOf(file)) {
        const res = await handler(request(method), context);
        expect(res.status, `${method} should require a user id`).toBe(401);
      }
    });
  });

  describe("deck ownership", () => {
    const deckRoutes = routeFiles.filter((file) => file.includes(`${path.sep}[id]${path.sep}`) || file.endsWith(`decks${path.sep}[id]${path.sep}route.ts`));

    it("covers the per-deck routes", () => {
      expect(deckRoutes.length).toBeGreaterThan(8);
    });

    it.each(deckRoutes.map((file) => [path.relative(API_DIR, file), file]))("%s only looks up decks owned by the signed-in user", async (_name, file) => {
      mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
      mocks.deckFindFirst.mockResolvedValue(null); // someone else's (or no) deck
      for (const { method, handler } of await handlersOf(file)) {
        mocks.deckFindFirst.mockClear();
        const res = await handler(request(method), context);
        expect(res.status, `${method} should answer 404 for a deck that isn't yours`).toBe(404);
        expect(mocks.deckFindFirst, `${method} should look the deck up`).toHaveBeenCalled();
        for (const [args] of mocks.deckFindFirst.mock.calls) {
          expect(args.where.id, `${method} must look up the one deck it was asked for`).toBe("deck-1");
          expect(reachableOnlyBy(args.where, "user-1"), `${method} must only find decks the signed-in user owns or was invited to`).toBe(true);
        }
      }
    });
  });
});
