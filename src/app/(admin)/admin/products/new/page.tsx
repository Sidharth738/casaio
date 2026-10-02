'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { Product } from '@/types';
import { ProductForm } from '@/components/seller/ProductForm';

export default function AdminNewProductPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (productData: Partial<Product>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create product');
      router.push('/admin/products');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while creating the product');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-200/80 pb-6">
        <Link href="/admin/products" aria-label="Back to products" className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">Add Product</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Create a product listing for the Casaio storefront.</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      <ProductForm onSubmit={handleCreate} isLoading={isSubmitting} />
    </div>
  );
}
