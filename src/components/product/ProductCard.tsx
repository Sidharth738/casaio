'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingBag, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { useWishlist } from '@/hooks/useWishlist';
import type { Product } from '@/types';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const isWishlisted = isInWishlist(product.id);

  const primaryImage = product.images.find((img) => img.isPrimary) ?? product.images[0];
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : null;

  const isLowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;
  const isOutOfStock = product.stock === 0;

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist({
      productId: product.id,
      title: product.title,
      slug: product.slug,
      imageUrl: primaryImage?.url ?? '',
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      sellerStoreName: product.sellerStoreName,
      inStock: product.stock > 0,
    });
  };

  return (
    <div className={cn('group flex flex-col rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs hover:shadow-md transition-all duration-300', className)}>
      {/* Image */}
      <div className="relative aspect-4/3 overflow-hidden bg-zinc-100 shrink-0">
        <Link href={`/products/${product.slug}`} className="relative block w-full h-full">
          {primaryImage ? (
            <Image
              src={primaryImage.url}
              alt={primaryImage.altText ?? product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className={cn(
                'object-cover transition-transform duration-500 group-hover:scale-105',
                isOutOfStock && 'opacity-60'
              )}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-100">
              <ShoppingBag className="w-10 h-10 text-zinc-300" />
            </div>
          )}
        </Link>

        {/* Badges overlay */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {discount && (
            <Badge variant="accent" size="sm">
              {discount}% OFF
            </Badge>
          )}
          {product.isFeatured && !discount && (
            <Badge variant="default" size="sm">
              Featured
            </Badge>
          )}
          {isOutOfStock && (
            <Badge variant="danger" size="sm">
              Out of Stock
            </Badge>
          )}
          {isLowStock && !isOutOfStock && (
            <Badge variant="warning" size="sm">
              Only {product.stock} left
            </Badge>
          )}
        </div>

        {/* Wishlist button */}
        <button
          type="button"
          onClick={handleToggleWishlist}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          className={cn(
            'absolute top-3 right-3 z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all shadow-xs',
            isWishlisted
              ? 'bg-rose-50 border-rose-200 text-rose-600 opacity-100'
              : 'bg-white/90 border-zinc-200 text-zinc-600 hover:bg-white hover:text-rose-500 opacity-0 group-hover:opacity-100'
          )}
        >
          <Heart className={cn('w-4 h-4', isWishlisted && 'fill-rose-500')} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4">
        <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
          {product.sellerStoreName}
        </div>

        <Link href={`/products/${product.slug}`}>
          <h3 className="font-serif font-bold text-sm text-zinc-900 group-hover:text-orange-700 transition-colors line-clamp-2 leading-snug mb-2">
            {product.title}
          </h3>
        </Link>

        {/* Rating */}
        {product.ratings.count > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <Star className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
            <span className="text-xs font-semibold text-zinc-800">
              {product.ratings.average.toFixed(1)}
            </span>
            <span className="text-[11px] text-zinc-400">({product.ratings.count})</span>
          </div>
        )}

        {/* Price row */}
        <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-serif font-bold text-base text-zinc-950">
              {formatCurrency(product.price)}
            </span>
            {product.compareAtPrice && (
              <span className="text-xs text-zinc-400 line-through">
                {formatCurrency(product.compareAtPrice)}
              </span>
            )}
          </div>
          <Link
            href={`/products/${product.slug}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors',
              isOutOfStock
                ? 'border-transparent text-zinc-600 hover:bg-zinc-100'
                : 'border-zinc-200 bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
            )}
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}
