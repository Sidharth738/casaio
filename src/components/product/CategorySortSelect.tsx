'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const SORT_OPTIONS = [
  { label: 'Featured', value: 'featured' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Top Rated', value: 'rating' },
] as const;

export function CategorySortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (nextValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', nextValue);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-xs text-zinc-500 whitespace-nowrap">
        Sort by
      </label>
      <select
        id="sort"
        name="sort"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
