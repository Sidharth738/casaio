import { Suspense } from 'react';
import type { Metadata } from 'next';
import ProductsClientPage from './ProductsClientPage';

export const metadata: Metadata = {
  title: 'Curated Furniture, Lighting & Home Decor',
  description: 'Browse premium curated home furnishings, lighting, and decor from verified Casaio workshops.',
  alternates: { canonical: '/products' },
};

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductsClientPage />
    </Suspense>
  );
}
