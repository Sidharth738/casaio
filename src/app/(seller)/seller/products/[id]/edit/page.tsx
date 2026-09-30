'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Product } from '@/types';
import { getProductById } from '@/lib/firebase/firestore';
import { ProductForm } from '@/components/seller/ProductForm';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;
  const { user } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!productId) return;

    getProductById(productId)
      .then((data) => {
        if (isMounted) setProduct(data);
      })
      .catch(() => {
        if (isMounted) setError('Unable to load product information.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [productId]);

  const handleUpdate = async (productData: Partial<Product>) => {
    if (!user || !productId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/seller/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productData,
          sellerId: user.uid,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update product');
      }

      router.push('/seller/products');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
        <p className="text-xs">Loading product details...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-xs text-zinc-500">Product not found.</p>
        <Link href="/seller/products" className="text-xs underline font-medium">
          Back to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-6 border-b border-zinc-200/80">
        <Link href="/seller/products">
          <button className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-950 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">
            Edit: {product.title}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            SKU: {product.sku} • Update prices, description, imagery, or inventory.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ProductForm
        initialProduct={product}
        onSubmit={handleUpdate}
        isLoading={isSubmitting}
      />
    </div>
  );
}
