'use client';

import { Globe2 } from 'lucide-react';
import { REGIONS } from '@/lib/currency';
import { useCurrency } from '@/hooks/useCurrency';

export function RegionSelector() {
  const { region, setRegion } = useCurrency();

  return (
    <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-sm">
      <Globe2 className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
      <span className="sr-only">Delivery region and currency</span>
      <select
        aria-label="Delivery region and currency"
        value={region.code}
        onChange={(event) => setRegion(event.target.value)}
        className="max-w-[118px] cursor-pointer appearance-none bg-transparent pr-0 font-semibold outline-none"
      >
        {REGIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name} ({option.currency})
          </option>
        ))}
      </select>
    </label>
  );
}
