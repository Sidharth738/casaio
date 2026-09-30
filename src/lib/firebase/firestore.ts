/**
 * Typed Firestore CRUD helpers for Casaio.
 * Uses the Firebase CLIENT SDK — safe to import in Server Components since
 * client.ts only initialises when actually called (not at import time).
 *
 * IMPORTANT: All public product/category reads go through these helpers.
 * Admin / seller writes happen via dedicated API routes that use the Admin SDK.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './client';
import type { Product, Category, ProductFilterParams } from '@/types';

// ─── Generic helpers ──────────────────────────────────────────────────────────

function docToData<T extends { id: string }>(
  snap: QueryDocumentSnapshot<DocumentData>
): T {
  return { id: snap.id, ...snap.data() } as T;
}

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Fetch all active categories ordered by sortOrder.
 */
export async function getCategories(): Promise<Category[]> {
  const q = query(
    collection(db, 'categories'),
    where('isActive', '==', true),
    orderBy('sortOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToData<Category>(d));
}

/**
 * Fetch a single category by its slug.
 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const q = query(collection(db, 'categories'), where('slug', '==', slug), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToData<Category>(snap.docs[0]);
}

// ─── Products ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export interface ProductPage {
  products: Product[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Fetch a paginated list of active products with optional filters.
 */
export async function getProducts(
  filters: ProductFilterParams = {},
  cursor?: QueryDocumentSnapshot<DocumentData>
): Promise<ProductPage> {
  const constraints: QueryConstraint[] = [where('status', '==', 'active')];

  if (filters.category) {
    constraints.push(where('categorySlug', '==', filters.category));
  }

  if (filters.inStockOnly) {
    constraints.push(where('stock', '>', 0));
  }

  if (filters.minPrice !== undefined) {
    constraints.push(where('price', '>=', filters.minPrice));
  }

  if (filters.maxPrice !== undefined) {
    constraints.push(where('price', '<=', filters.maxPrice));
  }

  // Sorting
  switch (filters.sortBy) {
    case 'price_asc':
      constraints.push(orderBy('price', 'asc'));
      break;
    case 'price_desc':
      constraints.push(orderBy('price', 'desc'));
      break;
    case 'rating':
      constraints.push(orderBy('ratings.average', 'desc'));
      break;
    case 'newest':
      constraints.push(orderBy('createdAt', 'desc'));
      break;
    case 'featured':
    default:
      constraints.push(orderBy('isFeatured', 'desc'), orderBy('salesCount', 'desc'));
      break;
  }

  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  constraints.push(limit(PAGE_SIZE + 1));

  const q = query(collection(db, 'products'), ...constraints);
  const snap = await getDocs(q);

  const hasMore = snap.docs.length > PAGE_SIZE;
  const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

  return {
    products: docs.map((d) => docToData<Product>(d)),
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}

/**
 * Fetch a single product by its slug.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const q = query(
    collection(db, 'products'),
    where('slug', '==', slug),
    where('status', '==', 'active'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToData<Product>(snap.docs[0]);
}

/**
 * Fetch a product by its Firestore document ID.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Product;
}

/**
 * Fetch featured products for the homepage (max 8).
 */
export async function getFeaturedProducts(): Promise<Product[]> {
  const q = query(
    collection(db, 'products'),
    where('status', '==', 'active'),
    where('isFeatured', '==', true),
    orderBy('salesCount', 'desc'),
    limit(8)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToData<Product>(d));
}

/**
 * Fetch related products by category, excluding the current product.
 */
export async function getRelatedProducts(
  categorySlug: string,
  excludeId: string,
  count = 4
): Promise<Product[]> {
  const q = query(
    collection(db, 'products'),
    where('status', '==', 'active'),
    where('categorySlug', '==', categorySlug),
    orderBy('salesCount', 'desc'),
    limit(count + 1)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => docToData<Product>(d))
    .filter((p) => p.id !== excludeId)
    .slice(0, count);
}

/**
 * Search products by title (client-side prefix match via Firestore range query).
 * For production full-text search, integrate Algolia or Typesense.
 */
export async function searchProducts(searchQuery: string, maxResults = 20): Promise<Product[]> {
  if (!searchQuery.trim()) return [];
  const end = searchQuery + '\uf8ff';
  const q = query(
    collection(db, 'products'),
    where('status', '==', 'active'),
    where('title', '>=', searchQuery),
    where('title', '<=', end),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToData<Product>(d));
}
