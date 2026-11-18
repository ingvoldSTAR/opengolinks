import type { NextConfig } from "next";

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/admin/:path*", headers: [...common, { key: "X-Frame-Options", value: "DENY" }] },
      // The gallery preview is shown inside the admin area, so it may be framed by this same site only.
      {
        source: "/api/galleries/:id/preview",
        headers: [...common, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/api/:path((?!galleries/[^/]+/preview$).*)",
        headers: [...common, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
