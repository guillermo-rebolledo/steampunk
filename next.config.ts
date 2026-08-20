import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Steam's capsule art. The `?t=` cache-buster means `search` has to stay
      // open here rather than being pinned to an exact value.
      {
        protocol: "https",
        hostname: "shared.akamai.steamstatic.com",
        pathname: "/store_item_assets/**",
      },
    ],
  },
};

export default nextConfig;
