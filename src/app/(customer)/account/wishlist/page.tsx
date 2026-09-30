'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';

export default function WishlistPage() {
  const { items, itemCount, removeItem, clearWishlist } = useWishlist();
  const { addItem } = useCart();

  const handleMoveToBag = (item: (typeof items)[0]) => {
    addItem({
      productId: item.productId,
      title: item.title,
      slug: item.slug,
      imageUrl: item.imageUrl,
      unitPrice: item.price,
      compareAtPrice: item.compareAtPrice,
      sellerId: '',
      sellerStoreName: item.sellerStoreName,
      maxStock: 99,
    });
    removeItem(item.productId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">
            My Curated Wishlist ({itemCount})
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Artisanal furnishings and limited drop decor saved to your account.
          </p>
        </div>

        {itemCount > 0 && (
          <button
            onClick={clearWishlist}
            className="text-xs text-zinc-400 hover:text-rose-600 transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Wishlist</span>
          </button>
        )}
      </div>

      {itemCount === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-50 mx-auto flex items-center justify-center text-rose-500">
            <Heart className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">Your wishlist is empty</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Save favorite architectural lighting, furniture, and stoneware ceramics as you explore.
            </p>
          </div>
          <Link href="/products" className="inline-block pt-2">
            <Button size="sm" variant="primary" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Explore Catalog
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.productId}
              className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
            >
              {/* Image */}
              <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-300">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                )}

                {/* Remove button overlay */}
                <button
                  onClick={() => removeItem(item.productId)}
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-rose-600 transition-colors shadow-xs"
                  aria-label="Remove item from wishlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {item.compareAtPrice && item.compareAtPrice > item.price && (
                  <div className="absolute top-2.5 left-2.5">
                    <Badge variant="accent" size="sm">
                      {Math.round(((item.compareAtPrice - item.price) / item.compareAtPrice) * 100)}% OFF
                    </Badge>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4 flex flex-col flex-1">
                <p className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
                  {item.sellerStoreName}
                </p>

                <Link href={`/products/${item.slug}`}>
                  <h4 className="font-serif font-bold text-sm text-zinc-900 group-hover:text-amber-700 transition-colors line-clamp-1 mb-2">
                    {item.title}
                  </h4>
                </Link>

                <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif font-bold text-base text-zinc-950">
                      {formatCurrency(item.price)}
                    </span>
                    {item.compareAtPrice && (
                      <span className="text-xs text-zinc-400 line-through">
                        {formatCurrency(item.compareAtPrice)}
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs shrink-0"
                    leftIcon={<ShoppingBag className="w-3.5 h-3.5" />}
                    onClick={() => handleMoveToBag(item)}
                  >
                    Move to Bag
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
