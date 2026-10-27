'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import type { ProductImage } from '@/types';
import { cn } from '@/lib/utils';
import { getSafeProductImageSource } from '@/lib/products/image-source';

interface Props {
  images: ProductImage[];
  title: string;
}

export function ProductImageGallery({ images, title }: Props) {
  const productImages = Array.isArray(images)
    ? images.filter((image): image is ProductImage => Boolean(image && typeof image === 'object'))
    : [];
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState(
    Math.max(0, productImages.findIndex((img) => img.isPrimary))
  );

  if (productImages.length === 0 || !productImages[current]) {
    return (
      <div className="aspect-square rounded-2xl bg-zinc-100 flex items-center justify-center">
        <ImageFallback />
      </div>
    );
  }

  const active = productImages[current];
  const activeSource = getSafeProductImageSource(active.url);
  const showActiveImage = activeSource !== null && !failedSources.has(activeSource);

  const markSourceFailed = (source: string) => {
    setFailedSources((previous) => new Set(previous).add(source));
  };

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200">
        {active.mediaType === 'video' && activeSource ? (
          <video src={activeSource} controls className="absolute inset-0 w-full h-full object-cover" />
        ) : showActiveImage && activeSource ? (
          <Image
            src={activeSource}
            alt={active.altText ?? title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            onError={() => markSourceFailed(activeSource)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageFallback />
          </div>
        )}

        {/* Prev / Next */}
        {productImages.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((c) => (c - 1 + productImages.length) % productImages.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-zinc-200 flex items-center justify-center shadow hover:bg-white transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrent((c) => (c + 1) % productImages.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-zinc-200 flex items-center justify-center shadow hover:bg-white transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {productImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {productImages.map((img, idx) => {
            const source = getSafeProductImageSource(img.url);
            return (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={cn(
                  'relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                  idx === current ? 'border-orange-500' : 'border-zinc-200 hover:border-zinc-400'
                )}
                aria-label={`View image ${idx + 1}`}
              >
                {img.mediaType === 'video' && source ? (
                  <video src={source} muted playsInline className="w-full h-full object-cover" />
                ) : source && !failedSources.has(source) ? (
                  <Image
                    src={source}
                    alt={img.altText ?? `${title} ${idx + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                    onError={() => markSourceFailed(source)}
                  />
                ) : (
                  <ImageFallback compact />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImageFallback({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn('flex flex-col items-center justify-center text-zinc-400', compact ? 'gap-1 text-[9px]' : 'gap-2 text-sm')}>
      <ImageOff className={compact ? 'h-4 w-4' : 'h-8 w-8'} aria-hidden="true" />
      {!compact && <span>Image unavailable</span>}
    </span>
  );
}
