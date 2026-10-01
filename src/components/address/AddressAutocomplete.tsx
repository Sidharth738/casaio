'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';

export interface PlaceResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface AddressAutocompleteProps {
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
}

export function AddressAutocomplete({
  onSelect,
  placeholder = 'Search address or locality via Google Maps...',
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim() || val.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) return;

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setIsOpen((data.suggestions || []).length > 0);
        }
      } catch {
        // Fallback gracefully
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (place: PlaceResult) => {
    setQuery(place.mainText);
    setIsOpen(false);
    onSelect(place);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          <MapPin className="w-4 h-4 text-amber-600" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2.5 text-xs bg-amber-50/20 border border-amber-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-colors"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-lg border border-zinc-200 z-50 overflow-hidden divide-y divide-zinc-100 max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-50 flex items-start gap-2.5 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-900 truncate">
                  {s.mainText}
                </p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {s.secondaryText || s.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
