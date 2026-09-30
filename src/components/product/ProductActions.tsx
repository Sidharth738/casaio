'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, ShoppingBag, Zap, Check, ShieldCheck, Truck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types';

interface ProductActionsProps {
  product: Product;
}

export function ProductActions({ product }: ProductActionsProps) {
  const router = useRouter();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    product.hasVariants && product.variants && product.variants.length > 0
      ? product.variants[0]
      : null
  );
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [addedMessage, setAddedMessage] = useState(false);

  const currentPrice = selectedVariant ? selectedVariant.price : product.price;
  const currentCompareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPrice;
  const currentStock = selectedVariant ? selectedVariant.stock : product.stock;
  const isOutOfStock = currentStock <= 0;
  const isLowStock = currentStock > 0 && currentStock <= product.lowStockThreshold;

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > currentStock) return currentStock;
      return next;
    });
  };

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    // Dispatches custom event for cart listeners until Phase 4 CartContext connects
    const cartEvent = new CustomEvent('casaio:cart:add', {
      detail: {
        productId: product.id,
        variantSku: selectedVariant?.sku,
        quantity,
      },
    });
    window.dispatchEvent(cartEvent);

    setAddedMessage(true);
    setTimeout(() => setAddedMessage(false), 2500);
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    handleAddToCart();
    router.push('/checkout');
  };

  return (
    <div className="space-y-6">
      {/* Price section */}
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950">
          {formatCurrency(currentPrice)}
        </span>
        {currentCompareAtPrice && currentCompareAtPrice > currentPrice && (
          <>
            <span className="text-lg text-zinc-400 line-through">
              {formatCurrency(currentCompareAtPrice)}
            </span>
            <Badge variant="accent" size="sm">
              {Math.round(((currentCompareAtPrice - currentPrice) / currentCompareAtPrice) * 100)}% OFF
            </Badge>
          </>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Inclusive of all taxes. Free insured delivery across India.
      </p>

      {/* Stock Status Indicator */}
      <div className="flex items-center gap-2">
        {isOutOfStock ? (
          <Badge variant="danger" size="sm">
            Out of Stock
          </Badge>
        ) : isLowStock ? (
          <Badge variant="warning" size="sm">
            Only {currentStock} units remaining
          </Badge>
        ) : (
          <Badge variant="success" size="sm">
            In Stock &bull; Ready to Dispatch
          </Badge>
        )}
      </div>

      {/* Variants (if applicable) */}
      {product.hasVariants && product.variants && product.variants.length > 0 && (
        <div className="space-y-3 pt-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
            Select Configuration: <span className="text-zinc-900 normal-case">{selectedVariant?.title}</span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            {product.variants.map((v) => {
              const isSelected = selectedVariant?.sku === v.sku;
              const isVariantOos = v.stock <= 0;
              return (
                <button
                  key={v.sku}
                  type="button"
                  disabled={isVariantOos}
                  onClick={() => {
                    setSelectedVariant(v);
                    setQuantity(1);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                    isSelected
                      ? 'border-amber-600 bg-amber-50/80 text-amber-900 ring-2 ring-amber-500/20 shadow-xs'
                      : isVariantOos
                      ? 'border-zinc-200 bg-zinc-100 text-zinc-400 line-through cursor-not-allowed'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                  }`}
                >
                  {v.title}
                  {v.price !== product.price && (
                    <span className="ml-1.5 opacity-75 font-normal">
                      ({formatCurrency(v.price)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity & CTA Buttons */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center border border-zinc-200 rounded-lg bg-white overflow-hidden shadow-2xs">
            <button
              type="button"
              disabled={quantity <= 1 || isOutOfStock}
              onClick={() => handleQuantityChange(-1)}
              className="px-3.5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <span className="w-10 text-center text-sm font-semibold text-zinc-900">
              {quantity}
            </span>
            <button
              type="button"
              disabled={quantity >= currentStock || isOutOfStock}
              onClick={() => handleQuantityChange(1)}
              className="px-3.5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsWishlisted(!isWishlisted)}
            className={`p-2.5 rounded-lg border transition-colors flex items-center justify-center ${
              isWishlisted
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
            }`}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          >
            <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-rose-500' : ''}`} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Button
            type="button"
            size="lg"
            variant="secondary"
            disabled={isOutOfStock}
            onClick={handleAddToCart}
            leftIcon={addedMessage ? <Check className="w-4 h-4 text-emerald-600" /> : <ShoppingBag className="w-4 h-4" />}
            className="w-full text-sm"
          >
            {addedMessage ? 'Added to Cart' : isOutOfStock ? 'Sold Out' : 'Add to Cart'}
          </Button>

          <Button
            type="button"
            size="lg"
            variant="accent"
            disabled={isOutOfStock}
            onClick={handleBuyNow}
            leftIcon={<Zap className="w-4 h-4" />}
            className="w-full text-sm font-medium"
          >
            Buy Now with Express
          </Button>
        </div>

        {addedMessage && (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5 animate-fade-in font-medium pt-1">
            <Check className="w-3.5 h-3.5" /> Item added to your bag successfully.
          </p>
        )}
      </div>

      {/* Trust & Guarantee Badges */}
      <div className="pt-4 border-t border-zinc-200/80 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-zinc-900">Casaio Verified Artisan Guarantee</p>
            <p className="text-[11px] text-zinc-500">Every consignment is inspected for finish quality and authentic materials prior to dispatch.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Truck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-zinc-900">White Glove Dropship Delivery</p>
            <p className="text-[11px] text-zinc-500">Dispatched directly from the maker&apos;s workshop. Free door-to-door transit insurance included.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-zinc-900">7-Day Return Window</p>
            <p className="text-[11px] text-zinc-500">No questions asked return pickup if damaged or not matching description.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
