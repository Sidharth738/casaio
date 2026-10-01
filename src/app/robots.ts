import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://casaio.app';

/**
 * Robots.txt directive:
 * - Allow all public storefront pages for indexing
 * - Block admin, seller portal, account, API, and checkout routes
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/products',
          '/products/',
          '/categories',
          '/categories/',
        ],
        disallow: [
          '/admin',
          '/admin/',
          '/seller',
          '/seller/',
          '/account',
          '/account/',
          '/checkout',
          '/checkout/',
          '/cart',
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/order-confirmation/',
          '/unauthorized',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
