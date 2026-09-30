import { Suspense } from 'react';
import type { Metadata } from 'next';
import ProductsClientPage from './ProductsClientPage';

export const metadata: Metadata = {
  title: 'All Products | Casaio',
  description: 'Browse premium curated home furnishings, lighting, and décor on Casaio.',
};

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductsClientPage />
    </Suspense>
  );
}
