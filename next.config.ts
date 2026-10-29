import type { NextConfig } from 'next';
import { PRODUCT_IMAGE_REMOTE_HOSTS } from './src/lib/products/image-source';

const nextConfig: NextConfig = {
  // Keep framework tooling out of the customer-facing storefront preview.
  // Build and runtime errors are still surfaced by Next.js when they occur.
  devIndicators: false,
  // Keep the isolated Refunds browser-test server from sharing the dev output
  // directory and lock with a developer's existing Next.js process.
  ...(process.env.CASAIO_PLAYWRIGHT_TEST === 'true' ? { distDir: '.next/playwright' } : {}),
  images: {
    formats: ['image/avif', 'image/webp'],
    // Keep the storefront's existing per-image quality settings valid so
    // Next.js can generate the intended smaller responsive image variants.
    qualities: [60, 65, 75],
    minimumCacheTTL: 31536000,
    localPatterns: [
      {
        pathname: '/casaio-logo.jpeg',
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
  productionBrowserSourceMaps: false,
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
