import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { getCategories } from '@/lib/firebase/firestore';
import type { Category } from '@/types';
import { Layers } from 'lucide-react';
import { getRenderableImageUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'All Categories | Casaio',
  description: 'Browse all curated home décor and furniture categories on Casaio.',
};

// Revalidate every 30 minutes — categories change infrequently
export const revalidate = 60;

async function CategoriesGrid() {
  let categories: Category[] = [];
  try {
    categories = await getCategories();
  } catch {
    // Firestore unavailable during build (no credentials) — show empty state
    categories = [];
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center">
        <Layers className="w-14 h-14 text-zinc-300 mb-4" />
        <p className="font-serif text-xl font-semibold text-zinc-700">No Categories Yet</p>
        <p className="text-sm text-zinc-500 mt-2 max-w-sm">
          Our curators are preparing the collections. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {categories.map((cat) => (
        <Link
          key={cat.id}
          href={`/categories/${cat.slug}`}
          className="group relative block aspect-square rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
        >
          {getRenderableImageUrl(cat.imageUrl) ? (
            <Image
              src={getRenderableImageUrl(cat.imageUrl)!}
              alt={cat.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
              <Layers className="w-10 h-10 text-zinc-300" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5">
            <h2 className="font-serif text-lg font-bold text-white group-hover:text-orange-200 transition-colors leading-snug">
              {cat.name}
            </h2>
            {cat.description && (
              <p className="text-[11px] text-zinc-300 mt-1 line-clamp-1">{cat.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div className="py-10 sm:py-14">
      <Container>
        {/* Page Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-widest">
            Curated Collections
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950 mt-1">
            Shop By Category
          </h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-lg">
            Explore our hand-curated collections of premium home furnishings, décor, and lifestyle objects.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-zinc-100 animate-pulse" />
              ))}
            </div>
          }
        >
          <CategoriesGrid />
        </Suspense>
      </Container>
    </div>
  );
}
