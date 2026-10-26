'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { getSafeProductImageSource } from '@/lib/products/image-source';

interface SafeProductImageProps {
  src: unknown;
  alt: string;
  sizes: string;
  className?: string;
  fallbackIconClassName?: string;
}

/** Renders only sources accepted by the shared Next Image allowlist. */
export function SafeProductImage({
  src,
  alt,
  sizes,
  className = 'object-cover',
  fallbackIconClassName = 'h-6 w-6',
}: SafeProductImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageSource = getSafeProductImageSource(src);

  if (!imageSource || failedSource === imageSource) {
    return (
      <div
        role="img"
        aria-label={`${alt} image unavailable`}
        className="absolute inset-0 flex items-center justify-center text-zinc-300"
      >
        <ShoppingBag className={fallbackIconClassName} aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailedSource(imageSource)}
    />
  );
}
