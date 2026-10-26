import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { Category, Product, ProductFilterParams } from '@/types';
import { toPublicProduct } from '@/lib/products/public-projection';

const PAGE_SIZE = 20;

export async function getPublicCategories(): Promise<Category[]> {
  const snapshot = await adminDb.collection('categories')
    .where('isActive', '==', true)
    .get();
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }) as Category)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function getPublicCategoryBySlug(slug: string): Promise<Category | null> {
  const snapshot = await adminDb.collection('categories')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Category;
}

export async function getPublicProducts(): Promise<Product[]> {
  const snapshot = await adminDb.collection('products')
    .where('status', '==', 'active')
    .limit(500)
    .get();
  return snapshot.docs.map((doc) => toPublicProduct({ id: doc.id, ...doc.data() } as Product));
}

export async function getPublicProductPage(filters: ProductFilterParams = {}) {
  let products = await getPublicProducts();
  if (filters.category) products = products.filter((product) => product.categorySlug === filters.category);
  if (filters.inStockOnly) products = products.filter((product) => product.stock > 0);
  if (filters.minPrice !== undefined) products = products.filter((product) => product.price >= filters.minPrice!);
  if (filters.maxPrice !== undefined) products = products.filter((product) => product.price <= filters.maxPrice!);
  if (filters.searchQuery?.trim()) {
    const term = filters.searchQuery.trim().toLowerCase();
    products = products.filter((product) => product.title.toLowerCase().includes(term));
  }
  const dateValue = (value: string | undefined) => value ? new Date(value).getTime() : 0;
  switch (filters.sortBy) {
    case 'price_asc': products.sort((a, b) => a.price - b.price); break;
    case 'price_desc': products.sort((a, b) => b.price - a.price); break;
    case 'rating': products.sort((a, b) => b.ratings.average - a.ratings.average); break;
    case 'newest': products.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)); break;
    case 'featured':
    default: products.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.salesCount - a.salesCount); break;
  }
  const page = products.slice(0, PAGE_SIZE);
  return { products: page, lastDoc: null, hasMore: products.length > PAGE_SIZE };
}

export async function getRelatedPublicProducts(categorySlug: string, excludeId: string, count = 4) {
  const products = await getPublicProducts();
  products.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.salesCount - a.salesCount);
  return products.filter((product) => product.categorySlug === categorySlug && product.id !== excludeId).slice(0, count);
}

export async function getActiveProductBySlug(slug: string): Promise<Product | null> {
  const snapshot = await adminDb
    .collection('products')
    .where('slug', '==', slug)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const product = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Product;
  return product.status === 'active' ? toPublicProduct(product) : null;
}
