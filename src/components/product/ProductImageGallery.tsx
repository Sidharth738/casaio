'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  images: ProductImage[];
  title: string;
}

export function ProductImageGallery({ images, title }: Props) {
  const [current, setCurrent] = useState(
    Math.max(0, images.findIndex((img) => img.isPrimary))
  );

  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-2xl bg-zinc-100 flex items-center justify-center">
        <span className="text-zinc-400 text-sm">No image available</span>
      </div>
    );
  }

  const active = images[current];

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200">
        <Image
          src={active.url}
          alt={active.altText ?? title}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />

        {/* Prev / Next */}
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((c) => (c - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-zinc-200 flex items-center justify-center shadow hover:bg-white transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrent((c) => (c + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-zinc-200 flex items-center justify-center shadow hover:bg-white transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              className={cn(
                'relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                idx === current ? 'border-amber-500' : 'border-zinc-200 hover:border-zinc-400'
              )}
              aria-label={`View image ${idx + 1}`}
            >
              <Image
                src={img.url}
                alt={img.altText ?? `${title} ${idx + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
