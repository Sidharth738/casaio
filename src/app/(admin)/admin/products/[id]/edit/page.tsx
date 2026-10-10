'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import type { Product } from '@/types';
import { getProductById } from '@/lib/firebase/firestore';
import { ProductForm } from '@/components/seller/ProductForm';

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getProductById(productId)
      .then((result) => {
        if (isMounted) setProduct(result);
      })
      .catch(() => {
        if (isMounted) setError('Unable to load product details.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingProduct(false);
      });

    return () => {
      isMounted = false;
    };
  }, [productId]);

  const handleUpdate = async (productData: Partial<Product>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update product');
      router.push('/admin/products');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Failed to update product');
      setIsSubmitting(false);
    }
  };

  if (isLoadingProduct) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
        <p className="text-xs">Loading product details...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-xs text-zinc-500">Product not found.</p>
        <Link href="/admin/products" className="text-xs underline font-medium">Back to products</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 pb-6 border-b border-zinc-200/80">
        <Link
          href="/admin/products"
          aria-label="Back to products"
          className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-950 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">Edit: {product.title}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Update product details, pricing, imagery, inventory, or sale status.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ProductForm
        initialProduct={product}
        onSubmit={handleUpdate}
        isLoading={isSubmitting}
        availableStatuses={['active', 'draft', 'out_of_stock', 'archived']}
        cancelHref="/admin/products"
      />
    </div>
  );
}
