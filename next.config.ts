import type { NextConfig } from 'next';
import { PRODUCT_IMAGE_REMOTE_HOSTS } from './src/lib/products/image-source';

const nextConfig: NextConfig = {
  // Keep the isolated Refunds browser-test server from sharing the dev output
  // directory and lock with a developer's existing Next.js process.
  ...(process.env.CASAIO_PLAYWRIGHT_TEST === 'true' ? { distDir: '.next/playwright' } : {}),
  images: {
    remotePatterns: PRODUCT_IMAGE_REMOTE_HOSTS.map((hostname) => ({
      protocol: 'https' as const,
      hostname,
    })),
  },
};

export default nextConfig;
