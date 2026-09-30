'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

export function CartDrawer() {
  const { items, itemCount, subtotal, isOpen, closeCart, updateQuantity, removeItem } = useCart();

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
          {/* Header */}
          <div className="p-5 border-b border-zinc-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-700" />
              <h2 className="font-serif text-lg font-bold text-zinc-950">
                Your Shopping Bag ({itemCount})
              </h2>
            </div>
            <button
              onClick={closeCart}
              className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              aria-label="Close cart drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Item List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-zinc-100">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-700">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-zinc-900">Your bag is empty</h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    Explore our curated collections of architectural furnishings and artisan home accents.
                  </p>
                </div>
                <Link href="/products" onClick={closeCart}>
                  <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    Discover Pieces
                  </Button>
                </Link>
              </div>
            ) : (
              items.map((item) => {
                const key = item.variantSku ? `${item.productId}-${item.variantSku}` : item.productId;
                return (
                  <div key={key} className="pt-4 first:pt-0 flex gap-4">
                    {/* Thumbnail */}
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/80">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-zinc-300">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Info & Controls */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/products/${item.slug}`}
                            onClick={closeCart}
                            className="font-serif text-sm font-semibold text-zinc-900 hover:text-amber-700 transition-colors line-clamp-1"
                          >
                            {item.title}
                          </Link>
                          <button
                            onClick={() => removeItem(item.productId, item.variantSku)}
                            className="text-zinc-400 hover:text-rose-600 transition-colors p-1"
                            aria-label={`Remove ${item.title}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {item.variantSku && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            SKU: {item.variantSku}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-400">By {item.sellerStoreName}</p>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1">
                        {/* Quantity Counter */}
                        <div className="flex items-center border border-zinc-200 rounded-md bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.productId, item.quantity - 1, item.variantSku)
                            }
                            className="px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 transition-colors"
                          >
                            -
                          </button>
                          <span className="w-7 text-center text-xs font-semibold text-zinc-800">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= item.maxStock}
                            onClick={() =>
                              updateQuantity(item.productId, item.quantity + 1, item.variantSku)
                            }
                            className="px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <span className="font-serif font-bold text-sm text-zinc-950">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Summary */}
          {items.length > 0 && (
            <div className="p-5 border-t border-zinc-200/80 bg-zinc-50/50 space-y-4">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-serif font-bold text-zinc-900 text-sm">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Insured Express Shipping</span>
                  <span className="text-emerald-700 font-semibold">FREE</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>GST inclusive. Multi-point artisan inspection guaranteed.</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Link href="/cart" onClick={closeCart} className="w-full">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    View Full Bag
                  </Button>
                </Link>
                <Link href="/checkout" onClick={closeCart} className="w-full">
                  <Button variant="accent" size="sm" className="w-full text-xs font-medium">
                    Checkout Now
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
