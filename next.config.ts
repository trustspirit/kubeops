import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@xterm/xterm'],
  turbopack: {},
};

export default nextConfig;
