'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewStarsProps {
  /** Numeric rating 0–5 (supports decimals for display) */
  rating: number;
  /** Maximum stars — defaults to 5 */
  max?: number;
  /** Icon size class — defaults to 'w-4 h-4' */
  size?: string;
  /** Whether the stars are interactive (clickable) */
  interactive?: boolean;
  /** Callback fired when the user clicks a star (interactive mode only) */
  onRate?: (rating: number) => void;
  /** Extra class on the wrapper element */
  className?: string;
}

/**
 * Renders a row of gold star icons reflecting the given rating.
 * In interactive mode each star is a clickable button.
 */
export function ReviewStars({
  rating,
  max = 5,
  size = 'w-4 h-4',
  interactive = false,
  onRate,
  className,
}: ReviewStarsProps) {
  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      aria-label={`Rating: ${rating} out of ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < Math.floor(rating);
        const half = !filled && i < rating;
        const value = i + 1;

        const icon = (
          <Star
            className={cn(
              size,
              filled || half
                ? 'fill-amber-500 text-amber-500'
                : 'fill-zinc-200 text-zinc-200',
              interactive && 'cursor-pointer transition-colors hover:fill-amber-400 hover:text-amber-400'
            )}
          />
        );

        if (interactive) {
          return (
            <button
              key={i}
              type="button"
              aria-label={`Rate ${value} star${value !== 1 ? 's' : ''}`}
              onClick={() => onRate?.(value)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
            >
              {icon}
            </button>
          );
        }

        return <span key={i}>{icon}</span>;
      })}
    </div>
  );
}
