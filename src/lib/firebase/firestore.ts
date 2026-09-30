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

// ─── Addresses ────────────────────────────────────────────────────────────────

import type { UserAddress, Order, CouponValidationResult, Coupon } from '@/types';
import { addDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export async function getUserAddresses(userId: string): Promise<UserAddress[]> {
  if (!userId) return [];
  const q = query(
    collection(db, 'addresses'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<UserAddress>(d));
  } catch {
    // If composite index is pending, fallback without orderBy
    const fallbackQ = query(collection(db, 'addresses'), where('userId', '==', userId));
    const snap = await getDocs(fallbackQ);
    return snap.docs.map((d) => docToData<UserAddress>(d));
  }
}

export async function saveUserAddress(
  userId: string,
  data: Omit<UserAddress, 'id' | 'userId' | 'createdAt'>,
  addressId?: string
): Promise<string> {
  const addressesCol = collection(db, 'addresses');

  // If this address is set to default, unset other defaults for this user
  if (data.isDefault) {
    try {
      const existing = await getUserAddresses(userId);
      const batch = writeBatch(db);
      existing.forEach((addr) => {
        if (addr.isDefault && addr.id !== addressId) {
          batch.update(doc(db, 'addresses', addr.id), { isDefault: false });
        }
      });
      await batch.commit();
    } catch {
      // Ignore batch error if rules prevent
    }
  }

  if (addressId) {
    const addrRef = doc(db, 'addresses', addressId);
    await updateDoc(addrRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return addressId;
  } else {
    const docRef = await addDoc(addressesCol, {
      ...data,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  }
}

export async function deleteUserAddress(addressId: string): Promise<void> {
  await deleteDoc(doc(db, 'addresses', addressId));
}

export async function setDefaultUserAddress(userId: string, addressId: string): Promise<void> {
  const addresses = await getUserAddresses(userId);
  const batch = writeBatch(db);
  addresses.forEach((addr) => {
    batch.update(doc(db, 'addresses', addr.id), {
      isDefault: addr.id === addressId,
    });
  });
  await batch.commit();
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getUserOrders(customerId: string): Promise<Order[]> {
  if (!customerId) return [];
  try {
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Order>(d));
  } catch {
    const fallbackQ = query(
      collection(db, 'orders'),
      where('customerId', '==', customerId)
    );
    const snap = await getDocs(fallbackQ);
    const orders = snap.docs.map((d) => docToData<Order>(d));
    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  if (!orderId) return null;
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return null;
  return docToData<Order>(snap as QueryDocumentSnapshot<DocumentData>);
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

export async function validateCouponCode(code: string, subtotal: number): Promise<CouponValidationResult> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { isValid: false, discountAmount: 0, message: 'Please enter a valid coupon code.' };
  }

  try {
    const q = query(
      collection(db, 'coupons'),
      where('code', '==', cleanCode),
      where('isActive', '==', true),
      limit(1)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      // Check hardcoded promotional coupons for dev / staging
      if (cleanCode === 'CASAIO10') {
        const discountAmount = Math.round(subtotal * 0.1);
        return {
          isValid: true,
          discountAmount,
          message: '10% artisanal promotional discount applied!',
          coupon: {
            id: 'promo-casaio10',
            code: 'CASAIO10',
            description: '10% off your entire order',
            discountType: 'percentage',
            discountValue: 10,
            minOrderValue: 0,
            validFrom: '2026-01-01T00:00:00Z',
            validUntil: '2026-12-31T23:59:59Z',
            usageLimit: 10000,
            usageCount: 12,
            perUserLimit: 1,
            isActive: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        };
      }
      if (cleanCode === 'WELCOME500') {
        if (subtotal < 2999) {
          return {
            isValid: false,
            discountAmount: 0,
            message: 'Coupon WELCOME500 requires a minimum order value of ₹2,999.',
          };
        }
        return {
          isValid: true,
          discountAmount: 500,
          message: '₹500 welcome discount applied!',
          coupon: {
            id: 'promo-welcome500',
            code: 'WELCOME500',
            description: '₹500 off orders above ₹2,999',
            discountType: 'flat',
            discountValue: 500,
            minOrderValue: 2999,
            validFrom: '2026-01-01T00:00:00Z',
            validUntil: '2026-12-31T23:59:59Z',
            usageLimit: 5000,
            usageCount: 45,
            perUserLimit: 1,
            isActive: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        };
      }

      return { isValid: false, discountAmount: 0, message: 'Invalid or expired coupon code.' };
    }

    const coupon = docToData<Coupon>(snap.docs[0]);
    if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
      return {
        isValid: false,
        discountAmount: 0,
        message: `Minimum order value of ₹${coupon.minOrderValue.toLocaleString('en-IN')} required for this coupon.`,
      };
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((subtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }

    return {
      isValid: true,
      discountAmount,
      message: `${coupon.description || coupon.code} applied!`,
      coupon,
    };
  } catch {
    return { isValid: false, discountAmount: 0, message: 'Failed to validate coupon at this time.' };
  }
}

// ─── Seller Management ────────────────────────────────────────────────────────

import type { SellerProfile } from '@/types';

export async function getSellerProfile(sellerId: string): Promise<SellerProfile | null> {
  if (!sellerId) return null;
  const snap = await getDoc(doc(db, 'sellers', sellerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SellerProfile;
}

export async function getSellerProducts(sellerId: string): Promise<Product[]> {
  if (!sellerId) return [];
  try {
    const q = query(
      collection(db, 'products'),
      where('sellerId', '==', sellerId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Product>(d));
  } catch {
    const fallbackQ = query(
      collection(db, 'products'),
      where('sellerId', '==', sellerId)
    );
    const snap = await getDocs(fallbackQ);
    const items = snap.docs.map((d) => docToData<Product>(d));
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function getSellerOrders(sellerId: string): Promise<Order[]> {
  if (!sellerId) return [];
  try {
    const q = query(
      collection(db, 'orders'),
      where('sellerIds', 'array-contains', sellerId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Order>(d));
  } catch {
    const fallbackQ = query(
      collection(db, 'orders'),
      where('sellerIds', 'array-contains', sellerId)
    );
    const snap = await getDocs(fallbackQ);
    const items = snap.docs.map((d) => docToData<Order>(d));
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function updateProductStock(productId: string, newStock: number): Promise<void> {
  const pRef = doc(db, 'products', productId);
  await updateDoc(pRef, {
    stock: Math.max(0, newStock),
    status: newStock <= 0 ? 'out_of_stock' : 'active',
    updatedAt: new Date().toISOString(),
  });
}


