'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SlidersHorizontal, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/product/ProductCard';
import { Container } from '@/components/ui/Container';
import { getProducts, getCategories } from '@/lib/firebase/firestore';
import { formatCurrency } from '@/lib/utils';
import type { Product, Category, ProductFilterParams } from '@/types';

const SORT_OPTIONS = [
  { label: 'Featured', value: 'featured' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Top Rated', value: 'rating' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export default function ProductsClientPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Read filters from URL
  const currentCategory = searchParams.get('category') ?? '';
  const currentSort = (searchParams.get('sort') ?? 'featured') as SortValue;
  const currentSearch = searchParams.get('q') ?? '';
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
  const inStockOnly = searchParams.get('inStock') === '1';

  // Local filter state (synced to URL on apply)
  const [localMin, setLocalMin] = useState(minPrice?.toString() ?? '');
  const [localMax, setLocalMax] = useState(maxPrice?.toString() ?? '');
  const [localSearch, setLocalSearch] = useState(currentSearch);

  function updateUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    setLoading(true);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Fetch categories once
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Fetch products when URL filters change
  useEffect(() => {
    let isMounted = true;
    const filters: ProductFilterParams = {
      category: currentCategory || undefined,
      sortBy: currentSort,
      searchQuery: currentSearch || undefined,
      minPrice,
      maxPrice,
      inStockOnly,
    };
    getProducts(filters)
      .then(({ products }) => {
        if (isMounted) {
          setProducts(products);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setProducts([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentCategory, currentSort, currentSearch, minPrice, maxPrice, inStockOnly]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateUrl({ q: localSearch || undefined });
  }

  function handleApplyFilters() {
    updateUrl({
      minPrice: localMin || undefined,
      maxPrice: localMax || undefined,
    });
    setFiltersOpen(false);
  }

  function handleClearFilters() {
    setLocalMin('');
    setLocalMax('');
    updateUrl({ minPrice: undefined, maxPrice: undefined, category: undefined, inStock: undefined, q: undefined });
    setLocalSearch('');
    setFiltersOpen(false);
  }

  const hasActiveFilters = !!(currentCategory || minPrice || maxPrice || inStockOnly || currentSearch);

  return (
    <div className="py-10 sm:py-14">
      <Container>
        {/* Page Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-widest">All Collections</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950 mt-1">Our Catalogue</h1>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </form>

          {/* Sort */}
          <select
            value={currentSort}
            onChange={(e) => updateUrl({ sort: e.target.value })}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2.5 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Filter toggle */}
          <Button
            variant={filtersOpen ? 'primary' : 'outline'}
            size="sm"
            leftIcon={<SlidersHorizontal className="w-4 h-4" />}
            onClick={() => setFiltersOpen((v) => !v)}
            className="whitespace-nowrap"
          >
            Filters {hasActiveFilters && <span className="ml-1.5 w-2 h-2 rounded-full bg-orange-500 inline-block" />}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Sidebar Filters */}
          {filtersOpen && (
            <aside className="w-full md:w-56 md:shrink-0 space-y-6 rounded-xl border border-zinc-200 bg-white p-4 md:border-0 md:bg-transparent md:p-0">
              {/* Category filter */}
              <div>
                <p className="text-xs font-semibold text-zinc-700 uppercase tracking-widest mb-2">Category</p>
                <div className="space-y-1">
                  <button
                    onClick={() => updateUrl({ category: undefined })}
                    className={`block w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${!currentCategory ? 'bg-orange-50 text-orange-800 font-medium' : 'text-zinc-600 hover:bg-zinc-50'}`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => updateUrl({ category: cat.slug })}
                      className={`block w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${currentCategory === cat.slug ? 'bg-orange-50 text-orange-800 font-medium' : 'text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <p className="text-xs font-semibold text-zinc-700 uppercase tracking-widest mb-2">Price Range</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={localMin}
                    onChange={(e) => setLocalMin(e.target.value)}
                    min={0}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="text-zinc-400 text-xs">–</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={localMax}
                    onChange={(e) => setLocalMax(e.target.value)}
                    min={0}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                {(minPrice || maxPrice) && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {minPrice ? formatCurrency(minPrice) : '₹0'} – {maxPrice ? formatCurrency(maxPrice) : '∞'}
                  </p>
                )}
              </div>

              {/* In Stock Only */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => updateUrl({ inStock: e.target.checked ? '1' : undefined })}
                    className="rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm text-zinc-700">In Stock Only</span>
                </label>
              </div>

              <div className="space-y-2">
                <Button size="sm" variant="primary" className="w-full" onClick={handleApplyFilters}>
                  Apply Filters
                </Button>
                <Button size="sm" variant="ghost" className="w-full" onClick={handleClearFilters}>
                  <X className="w-3.5 h-3.5 mr-1" /> Clear All
                </Button>
              </div>
            </aside>
          )}

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 mb-4">
                {currentCategory && (
                  <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-800 border border-orange-200 rounded-full px-2.5 py-1">
                    {categories.find((c) => c.slug === currentCategory)?.name ?? currentCategory}
                    <button onClick={() => updateUrl({ category: undefined })} className="ml-0.5 hover:text-orange-900"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
                    In Stock <button onClick={() => updateUrl({ inStock: undefined })}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {(minPrice || maxPrice) && (
                  <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-full px-2.5 py-1">
                    {minPrice ? formatCurrency(minPrice) : '₹0'} – {maxPrice ? formatCurrency(maxPrice) : '∞'}
                    <button onClick={() => updateUrl({ minPrice: undefined, maxPrice: undefined })}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {currentSearch && (
                  <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-full px-2.5 py-1">
                    &quot;{currentSearch}&quot;
                    <button onClick={() => { setLocalSearch(''); updateUrl({ q: undefined }); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => (
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
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 text-center">
                <p className="font-serif text-xl font-semibold text-zinc-700">No Products Found</p>
                <p className="text-sm text-zinc-500 mt-2 max-w-sm">
                  Try adjusting your filters or check back later.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500 mb-4">{products.length} product{products.length !== 1 ? 's' : ''}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
