import type { MetadataRoute } from 'next';
import { getCategories, getProducts } from '@/lib/firebase/firestore';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://casaio.app';

/**
 * Dynamic sitemap covering:
 * - Static pages (home, products, categories, account pages)
 * - Dynamic category slugs from Firestore
 * - Dynamic product slugs from Firestore (first 200 for build safety)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static routes ─────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/products`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/categories`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // ── Dynamic category routes ────────────────────────────────────────────────
  let categoryRoutes: MetadataRoute.Sitemap = [];
  try {
    const categories = await getCategories();
    categoryRoutes = categories.map((cat) => ({
      url: `${BASE_URL}/categories/${cat.slug}`,
      lastModified: cat.updatedAt ? new Date(cat.updatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // Gracefully degrade — Firestore unavailable during build
  }

  // ── Dynamic product routes ─────────────────────────────────────────────────
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const { products } = await getProducts({});
    productRoutes = products.map((product) => ({
      url: `${BASE_URL}/products/${product.slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // Gracefully degrade — Firestore unavailable during build
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
