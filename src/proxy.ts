import { NextRequest, NextResponse } from "next/server";

// Builds the Content-Security-Policy for one request. Scripts may only run if
// they carry this request's random nonce (Next.js stamps its own scripts with it,
// and layout.tsx stamps the theme script), so injected markup can't execute.
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load their own chunks. React needs
    // eval in development only (it rebuilds server stack traces in the browser).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used for things like bar widths; styles can't
    // run code, so allowing them is a far smaller risk than inline scripts.
    "style-src 'self' 'unsafe-inline'",
    // Card art and mana symbols come from Scryfall's image hosts.
    "img-src 'self' data: blob: https://cards.scryfall.io https://svgs.scryfall.io",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: the JSON API, static assets and prefetches don't need a nonce.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
