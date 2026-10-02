import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { Product } from '@/types';

export async function getActiveProductBySlug(slug: string): Promise<Product | null> {
  const snapshot = await adminDb
    .collection('products')
    .where('slug', '==', slug)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const product = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Product;
  return product.status === 'active' ? product : null;
}
