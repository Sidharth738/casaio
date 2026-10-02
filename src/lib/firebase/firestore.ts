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
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './client';
import type { Product, Category, ProductFilterParams } from '@/types';

// ─── Generic helpers ──────────────────────────────────────────────────────────

function docToData<T>(
  snap: QueryDocumentSnapshot<DocumentData>
): T {
  const data = snap.data();
  return { id: snap.id, uid: data.uid || snap.id, ...data } as unknown as T;
}

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Fetch all active categories ordered by sortOrder.
 */
export async function getCategories(): Promise<Category[]> {
  // Keep this index-free so new categories remain visible without a composite index.
  const snap = await getDocs(collection(db, 'categories'));
  return snap.docs
    .map((d) => docToData<Category>(d))
    .filter((category) => category.isActive === true)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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
  // Apply storefront filters and ordering in memory. This avoids the compound
  // index requirements that previously made the catalogue silently look empty.
  const q = query(collection(db, 'products'), where('status', '==', 'active'), limit(500));
  const snap = await getDocs(q);
  let products = snap.docs.map((d) => docToData<Product>(d));
  if (filters.category) products = products.filter((product) => product.categorySlug === filters.category);
  if (filters.inStockOnly) products = products.filter((product) => product.stock > 0);
  if (filters.minPrice !== undefined) products = products.filter((product) => product.price >= filters.minPrice!);
  if (filters.maxPrice !== undefined) products = products.filter((product) => product.price <= filters.maxPrice!);
  if (filters.searchQuery?.trim()) {
    const searchTerm = filters.searchQuery.trim().toLowerCase();
    products = products.filter((product) => product.title.toLowerCase().includes(searchTerm));
  }

  const dateValue = (value: string | undefined) => value ? new Date(value).getTime() : 0;
  switch (filters.sortBy) {
    case 'price_asc': products.sort((a, b) => a.price - b.price); break;
    case 'price_desc': products.sort((a, b) => b.price - a.price); break;
    case 'rating': products.sort((a, b) => b.ratings.average - a.ratings.average); break;
    case 'newest': products.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)); break;
    case 'featured':
    default:
      products.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.salesCount - a.salesCount);
      break;
  }

  const cursorIndex = cursor ? products.findIndex((product) => product.id === cursor.id) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const docs = products.slice(startIndex, startIndex + PAGE_SIZE + 1);
  const hasMore = docs.length > PAGE_SIZE;
  const pageProducts = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    products: pageProducts,
    lastDoc: pageProducts.length > 0 ? snap.docs.find((d) => d.id === pageProducts[pageProducts.length - 1].id) ?? null : null,
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
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const product = docToData<Product>(snap.docs[0]);
  return product.status === 'active' ? product : null;
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
  const { products } = await getProducts({ sortBy: 'featured' });
  return products.filter((product) => product.isFeatured).slice(0, 8);
}

/**
 * Fetch related products by category, excluding the current product.
 */
export async function getRelatedProducts(
  categorySlug: string,
  excludeId: string,
  count = 4
): Promise<Product[]> {
  const { products } = await getProducts({ category: categorySlug, sortBy: 'featured' });
  return products.filter((product) => product.id !== excludeId).slice(0, count);
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
  // Optional form fields (especially coordinates) are sometimes undefined.
  // Firestore rejects undefined values instead of treating them as absent.
  const addressData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as Omit<UserAddress, 'id' | 'userId' | 'createdAt'>;

  // If this address is set to default, unset other defaults for this user
  if (addressData.isDefault) {
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
      ...addressData,
      updatedAt: new Date().toISOString(),
    });
    return addressId;
  } else {
    const docRef = await addDoc(addressesCol, {
      ...addressData,
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

// ─── Admin Oversight Helpers ──────────────────────────────────────────────────

import type { UserProfile } from '@/types';

export async function getAllSellers(): Promise<SellerProfile[]> {
  try {
    const q = query(collection(db, 'sellers'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<SellerProfile>(d));
  } catch {
    const snap = await getDocs(collection(db, 'sellers'));
    return snap.docs.map((d) => docToData<SellerProfile>(d));
  }
}

export async function getAllProductsAdmin(): Promise<Product[]> {
  try {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Product>(d));
  } catch {
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map((d) => docToData<Product>(d));
  }
}

export async function getAllOrdersAdmin(): Promise<Order[]> {
  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Order>(d));
  } catch {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs.map((d) => docToData<Order>(d));
  }
}

export async function getAllCoupons(): Promise<Coupon[]> {
  try {
    const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Coupon>(d));
  } catch {
    const snap = await getDocs(collection(db, 'coupons'));
    return snap.docs.map((d) => docToData<Coupon>(d));
  }
}

export async function getAllUsersAdmin(): Promise<UserProfile[]> {
  try {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<UserProfile>(d));
  } catch {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => docToData<UserProfile>(d));
  }
}

export async function saveCategory(
  data: Partial<Category>,
  categoryId?: string
): Promise<string> {
  const colRef = collection(db, 'categories');
  const now = new Date().toISOString();
  if (categoryId) {
    const docRef = doc(db, 'categories', categoryId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: now,
    });
    return categoryId;
  } else {
    const docRef = await addDoc(colRef, {
      ...data,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 1,
      createdAt: now,
      updatedAt: now,
    });
    return docRef.id;
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await deleteDoc(doc(db, 'categories', categoryId));
}

export async function saveCoupon(
  data: Partial<Coupon>,
  couponId?: string
): Promise<string> {
  const colRef = collection(db, 'coupons');
  const now = new Date().toISOString();
  if (couponId) {
    const docRef = doc(db, 'coupons', couponId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: now,
    });
    return couponId;
  } else {
    const docRef = await addDoc(colRef, {
      ...data,
      code: (data.code || '').trim().toUpperCase(),
      usageCount: 0,
      isActive: data.isActive ?? true,
      createdAt: now,
    });
    return docRef.id;
  }
}

export async function deleteCoupon(couponId: string): Promise<void> {
  await deleteDoc(doc(db, 'coupons', couponId));
}

// ─── Reviews & Ratings ────────────────────────────────────────────────────────

import type { Review } from '@/types';

export async function getProductReviews(productId: string): Promise<Review[]> {
  try {
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Review>(d));
  } catch {
    const fallbackQ = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      where('status', '==', 'published')
    );
    const snap = await getDocs(fallbackQ);
    const list = snap.docs.map((d) => docToData<Review>(d));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function getAllReviewsAdmin(): Promise<Review[]> {
  try {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<Review>(d));
  } catch {
    const snap = await getDocs(collection(db, 'reviews'));
    const list = snap.docs.map((d) => docToData<Review>(d));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function updateReviewStatus(
  reviewId: string,
  status: 'published' | 'hidden' | 'pending'
): Promise<void> {
  const rRef = doc(db, 'reviews', reviewId);
  await updateDoc(rRef, {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteReview(reviewId: string): Promise<void> {
  await deleteDoc(doc(db, 'reviews', reviewId));
}

// ─── Notifications ────────────────────────────────────────────────────────────

import type { AppNotification } from '@/types';

export async function getUserNotifications(userId: string): Promise<AppNotification[]> {
  if (!userId) return [];
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<AppNotification>(d));
  } catch {
    const fallbackQ = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(fallbackQ);
    const list = snap.docs.map((d) => docToData<AppNotification>(d));
    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const nRef = doc(db, 'notifications', notificationId);
  await updateDoc(nRef, {
    read: true,
  });
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed marking all notifications read:', err);
  }
}

export async function createNotification(
  data: Omit<AppNotification, 'id'>
): Promise<string> {
  const colRef = collection(db, 'notifications');
  const docRef = await addDoc(colRef, {
    ...data,
    read: data.read ?? false,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  return docRef.id;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, 'notifications', notificationId));
}
