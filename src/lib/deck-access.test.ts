import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("./prisma", () => ({ prisma: { deck: { findFirst } } }));

import { CAN, getDeckAccess, getDeckAccessWithCards, personName } from "./deck-access";

describe("getDeckAccess", () => {
  beforeEach(() => findFirst.mockReset());

  it("looks for a deck you own or were invited to, and nothing else", async () => {
    findFirst.mockResolvedValue(null);
    await getDeckAccess("deck-1", "user-1");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "deck-1", OR: [{ userId: "user-1" }, { collaborators: { some: { userId: "user-1" } } }] });
  });

  it("calls the owner the owner", async () => {
    findFirst.mockResolvedValue({ id: "deck-1", userId: "user-1", cards: [] });
    expect((await getDeckAccess("deck-1", "user-1"))?.role).toBe("owner");
  });

  it("calls an invited friend a contributor", async () => {
    findFirst.mockResolvedValue({ id: "deck-1", userId: "owner-9", cards: [] });
    expect((await getDeckAccess("deck-1", "user-1"))?.role).toBe("contributor");
  });

  it("gives strangers nothing", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getDeckAccess("deck-1", "stranger")).toBeNull();
  });
});

describe("getDeckAccessWithCards", () => {
  beforeEach(() => findFirst.mockReset());

  it("applies the same access rule, and also loads the cards with who suggested them", async () => {
    findFirst.mockResolvedValue({ id: "deck-1", userId: "owner-9", cards: [] });
    const access = await getDeckAccessWithCards("deck-1", "user-1");
    expect(access?.role).toBe("contributor");
    const call = findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: "deck-1", OR: [{ userId: "user-1" }, { collaborators: { some: { userId: "user-1" } } }] });
    expect(call.include.cards.include.addedBy).toBeTruthy();
  });

  it("gives strangers nothing", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getDeckAccessWithCards("deck-1", "stranger")).toBeNull();
  });
});

describe("what each role may do", () => {
  it("only the owner edits the deck itself; both can suggest", () => {
    expect(CAN.edit("owner")).toBe(true);
    expect(CAN.edit("contributor")).toBe(false);
    expect(CAN.suggest("owner")).toBe(true);
    expect(CAN.suggest("contributor")).toBe(true);
  });
});

describe("personName", () => {
  it("prefers the display name, then the start of the email", () => {
    expect(personName({ name: " Alice ", email: "a@x.test" })).toBe("Alice");
    expect(personName({ name: null, email: "bob@x.test" })).toBe("bob");
    expect(personName({ name: null, email: null })).toBe("Someone");
  });
});
