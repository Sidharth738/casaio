import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Layers } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ProductCard } from '@/components/product/ProductCard';
import { CategorySortSelect } from '@/components/product/CategorySortSelect';
import { getCategoryBySlug, getProducts } from '@/lib/firebase/firestore';
import type { Product, Category } from '@/types';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let category: Category | null = null;
  try {
    category = await getCategoryBySlug(slug);
  } catch {
    // fallback
  }
  if (!category) {
    return { title: 'Category Not Found | Casaio' };
  }
  return {
    title: `${category.name} | Casaio`,
    description: category.description ?? `Shop ${category.name} — premium curated pieces on Casaio.`,
  };
}

// Revalidate product listings every 10 minutes
export const revalidate = 60;

const SORT_OPTIONS = [
  { label: 'Featured', value: 'featured' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Top Rated', value: 'rating' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

async function CategoryProducts({
  categorySlug,
  sortBy,
}: {
  categorySlug: string;
  sortBy: SortValue;
}) {
  let products: Product[] = [];
  try {
    const result = await getProducts({ category: categorySlug, sortBy });
    products = result.products;
  } catch {
    products = [];
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center">
        <Layers className="w-14 h-14 text-zinc-300 mb-4" />
        <p className="font-serif text-xl font-semibold text-zinc-700">No Products Yet</p>
        <p className="text-sm text-zinc-500 mt-2 max-w-sm">
          Our sellers are stocking this collection. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { sort } = await searchParams;

  let category: Category | null = null;
  try {
    category = await getCategoryBySlug(slug);
  } catch {
    // Firestore unavailable during build
  }

  if (!category) notFound();

  const sortBy = (SORT_OPTIONS.find((o) => o.value === sort)?.value ?? 'featured') as SortValue;

  return (
    <div className="py-10 sm:py-14">
      <Container>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-8">
          <Link href="/" className="hover:text-zinc-800 transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/categories" className="hover:text-zinc-800 transition-colors">Categories</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-zinc-900 font-medium">{category.name}</span>
        </nav>

        {/* Category Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950">
              {category.name}
            </h1>
            {category.description && (
              <p className="text-sm text-zinc-500 mt-2 max-w-xl">{category.description}</p>
            )}
          </div>

          {/* Sort control */}
          <CategorySortSelect value={sortBy} />
        </div>

        {/* Products grid */}
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 bg-white overflow-hidden animate-pulse">
                  <div className="aspect-4/3 bg-zinc-100" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-zinc-100 rounded w-1/3" />
                    <div className="h-4 bg-zinc-100 rounded" />
                    <div className="h-4 bg-zinc-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <CategoryProducts categorySlug={slug} sortBy={sortBy} />
        </Suspense>
      </Container>
    </div>
  );
}
