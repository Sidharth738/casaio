import type { MetadataRoute } from 'next';
import { getPublicCategories, getPublicProducts } from '@/lib/firebase/server-catalog';
import { absoluteUrl } from '@/lib/seo';

const SITEMAP_DATA_TIMEOUT_MS = 5_000;

// Product/category URLs are runtime data; do not freeze the sitemap at build
// time when Firebase is unavailable in the build container.
export const dynamic = 'force-dynamic';

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Sitemap data lookup timed out')), SITEMAP_DATA_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static routes ─────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/products'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/categories'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  // Firebase is not available in the build container. Static routes remain
  // valid and the dynamic entries are generated on the first runtime request.
  if (process.env.NEXT_PHASE === 'phase-production-build') return staticRoutes;

  // ── Dynamic category routes ────────────────────────────────────────────────
  let categoryRoutes: MetadataRoute.Sitemap = [];
  try {
    const categories = await withTimeout(getPublicCategories());
    categoryRoutes = categories.map((cat) => ({
      url: absoluteUrl(`/categories/${cat.slug}`),
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
    const products = await withTimeout(getPublicProducts());
    productRoutes = products.map((product) => ({
      url: absoluteUrl(`/products/${product.slug}`),
      lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // Gracefully degrade — Firestore unavailable during build
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
