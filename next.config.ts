import type { NextConfig } from 'next';
import { PRODUCT_IMAGE_REMOTE_HOSTS } from './src/lib/products/image-source';

const nextConfig: NextConfig = {
  // Keep the isolated Refunds browser-test server from sharing the dev output
  // directory and lock with a developer's existing Next.js process.
  ...(process.env.CASAIO_PLAYWRIGHT_TEST === 'true' ? { distDir: '.next/playwright' } : {}),
  images: {
    localPatterns: [
      {
        pathname: '/casaio-logo.png',
      },
      {
        pathname: '/api/telegram/media',
      },
    ],
    remotePatterns: PRODUCT_IMAGE_REMOTE_HOSTS.map((hostname) => ({
      protocol: 'https' as const,
      hostname,
    })),
  },
  async headers() {
    return [
      {
        // HTML must not outlive a deployment: it contains the hashed CSS and
        // JavaScript chunk names for that deployment. Static assets remain
        // immutable and cacheable, so this only prevents stale documents from
        // referencing chunks that no longer exist on a device or edge cache.
        source: '/((?!_next/static|_next/image|api/|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
