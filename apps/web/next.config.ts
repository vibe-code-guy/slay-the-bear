import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The rules and agents packages ship TypeScript source shared with the contract tests.
  transpilePackages: ["@slay/rules", "@slay/agents"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
