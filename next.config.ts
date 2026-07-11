import type { NextConfig } from "next";

// Baseline HTTP security headers applied to every response.
//
// Intentionally NOT a restrictive script-src/default-src CSP: the interactive
// lesson and quiz HTML is admin-authored and served from this same origin
// (via /api/lesson-html and /play/q/[id]) using inline scripts, canvas and
// third-party CDNs. A strict script-src would break that content. Instead we
// harden the directives that carry no such risk here — clickjacking
// (frame-ancestors, all framing in this app is same-origin), plugin/object
// embedding and <base> injection — plus transport, sniffing, referrer and
// permissions hardening.
const securityHeaders = [
  // Force HTTPS for two years, including subdomains (safe: prod is HTTPS-only).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Clickjacking protection. SAMEORIGIN still allows the app to frame its own
  // /api/lesson-html and /play/q content; CSP frame-ancestors is the modern
  // equivalent and is honored where X-Frame-Options is not.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
  // Block MIME sniffing (defense in depth alongside per-route Content-Type).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak full URLs (which include signed lesson/storage capability tokens
  // as query params) to third-party origins via the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny access to powerful features the app never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // join.matem.school is the students' vanity door — everything on that
      // host bounces to the join page on the canonical origin. Staying on the
      // subdomain would put quiz pages on a second origin (backend CORS
      // allowlist, students' saved mid-quiz progress in localStorage), all
      // for an address-bar cosmetic that lasts two seconds.
      // join.matem.school/AB12C3 carries a room code along — the short form
      // for QR payloads; exactly 6 chars so real paths like /join never match.
      {
        source: "/:code([A-Za-z0-9]{6})",
        has: [{ type: "host", value: "join.matem.school" }],
        destination: "https://matem.school/join?code=:code",
        permanent: false,
      },
      // Everything else on the subdomain (incl. "/" and deep links with
      // ?code=, whose query passes through untouched) lands on the join page.
      {
        source: "/:path*",
        has: [{ type: "host", value: "join.matem.school" }],
        destination: "https://matem.school/join",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
