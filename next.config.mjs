import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xterm/xterm'],
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
};

export default nextConfig;
