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
};

export default nextConfig;
