import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo';

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
        allow: '/',
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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
