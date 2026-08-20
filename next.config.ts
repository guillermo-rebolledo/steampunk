import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Steam's capsule art. Steam serves the same image from several CDN
      // hosts and rewrites the path when a game changes its artwork, so this
      // trusts the whole of steamstatic.com rather than one host and prefix —
      // a capsule that fell outside the pattern would throw and take the whole
      // Shelf down with it, which is exactly what the parser refuses to do.
      // The `?t=` cache-buster means `search` has to stay open too.
      {
        protocol: "https",
        hostname: "**.steamstatic.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
