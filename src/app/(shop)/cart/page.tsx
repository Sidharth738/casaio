'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Trash2, ArrowRight, ShoppingBag, ShieldCheck, Truck, RefreshCw, ChevronRight } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const { items, itemCount, subtotal, shipping, total, updateQuantity, removeItem, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="py-20 sm:py-28">
        <Container>
          <div className="max-w-md mx-auto text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-orange-50 mx-auto flex items-center justify-center text-orange-700">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-zinc-950">Your Cart is Empty</h1>
            <p className="text-sm text-zinc-500 leading-relaxed">
              You haven&apos;t added any artisanal furnishings to your collection yet. Discover verified drops from curated makers worldwide.
            </p>
            <div className="pt-2">
              <Link href="/products">
                <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Explore Collections
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="py-10 sm:py-14">
      <Container>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-8">
          <Link href="/" className="hover:text-zinc-900 transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-zinc-900 font-medium">Shopping Cart</span>
        </nav>

        {/* Title & Item Count */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-widest">Order Review</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950 mt-1">
              Shopping Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
            </h1>
          </div>
          <button
            onClick={clearCart}
            className="text-xs text-zinc-500 hover:text-rose-600 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Entire Bag</span>
          </button>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-14 items-start">
          {/* Left Column: Cart Items List */}
          <div className="lg:col-span-8 space-y-4">
            <div className="divide-y divide-zinc-200 border-y border-zinc-200">
              {items.map((item) => {
                const key = item.variantSku ? `${item.productId}-${item.variantSku}` : item.productId;
                return (
                  <div key={key} className="py-6 flex flex-col sm:flex-row gap-5">
                    {/* Image */}
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/80">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          sizes="112px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <ShoppingBag className="w-8 h-8" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <Link
                              href={`/products/${item.slug}`}
                              className="font-serif text-base sm:text-lg font-bold text-zinc-950 hover:text-orange-700 transition-colors line-clamp-1"
                            >
                              {item.title}
                            </Link>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Crafted by <span className="font-semibold text-zinc-700">{item.sellerStoreName}</span>
                            </p>
                          </div>
                          <span className="font-serif font-bold text-base sm:text-lg text-zinc-950">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </span>
                        </div>

                        {item.variantSku && (
                          <div className="mt-1.5 inline-block text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono">
                            SKU: {item.variantSku}
                          </div>
                        )}
                      </div>

                      {/* Controls Row */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-zinc-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variantSku)}
                              className="px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
                              aria-label="Decrease quantity"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-xs font-semibold text-zinc-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={item.quantity >= item.maxStock}
                              onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantSku)}
                              className="px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-xs text-zinc-400">
                            {formatCurrency(item.unitPrice)} each
                          </span>
                        </div>

                        <button
                          onClick={() => removeItem(item.productId, item.variantSku)}
                          className="text-xs text-zinc-400 hover:text-rose-600 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Guarantees Box */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-xs text-zinc-600">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-zinc-900">100% Quality Vetted</p>
                  <p className="text-[11px] text-zinc-500">Inspected prior to dispatch.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <Truck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-zinc-900">Insured Dropship</p>
                  <p className="text-[11px] text-zinc-500">Free transit door-to-door.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <RefreshCw className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-zinc-900">7-Day Returns</p>
                  <p className="text-[11px] text-zinc-500">Hassle-free reverse pickup.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary Card */}
          <div className="lg:col-span-4">
            <Card className="p-6 sticky top-24 border-zinc-200/80 shadow-md">
              <h2 className="font-serif text-lg font-bold text-zinc-950 pb-4 border-b border-zinc-200">
                Order Summary
              </h2>

              <div className="space-y-3 py-5 text-xs text-zinc-600 border-b border-zinc-200">
                <div className="flex justify-between">
                  <span>Subtotal ({itemCount} items)</span>
                  <span className="font-serif font-bold text-zinc-900 text-sm">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Shipping</span>
                  <span className="text-emerald-700 font-semibold uppercase">
                    {shipping === 0 ? 'Free Insured' : formatCurrency(shipping)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes (GST)</span>
                  <span className="text-zinc-500 italic">Included in pricing</span>
                </div>
              </div>

              {/* Total Row */}
              <div className="py-4 flex justify-between items-baseline">
                <span className="font-serif text-base font-bold text-zinc-950">Grand Total</span>
                <span className="font-serif text-2xl font-bold text-zinc-950">
                  {formatCurrency(total)}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <Link href="/checkout" className="block w-full">
                  <Button size="lg" variant="accent" className="w-full text-sm font-medium">
                    Proceed to Checkout
                  </Button>
                </Link>
                <Link href="/products" className="block w-full">
                  <Button size="md" variant="outline" className="w-full text-xs">
                    Continue Browsing
                  </Button>
                </Link>
              </div>

              {/* Trust Footer */}
              <div className="pt-6 mt-6 border-t border-zinc-100 text-center">
                <p className="text-[11px] text-zinc-400">
                  Payments encrypted &amp; verified via Razorpay &bull; Cash on Delivery Available
                </p>
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}
