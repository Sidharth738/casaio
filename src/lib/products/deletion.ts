import { adminDb } from '@/lib/firebase/admin';

/**
 * Products with order or review history must be archived, not erased.
 * Orders store line items as maps inside an array, so check their item lists
 * directly before allowing a rare permanent deletion.
 */
export async function getProductDeletionBlockReason(productId: string): Promise<string | null> {
  const [ordersSnapshot, reviewsSnapshot] = await Promise.all([
    adminDb.collection('orders').get(),
    adminDb.collection('reviews').where('productId', '==', productId).limit(1).get(),
  ]);

  const hasOrderHistory = ordersSnapshot.docs.some((orderDoc) => {
    const items = orderDoc.data().items;
    return Array.isArray(items) && items.some((item) => item?.productId === productId);
  });

  if (hasOrderHistory) {
    return 'This product has order history and cannot be permanently deleted. Archive it to remove it from sale.';
  }

  if (!reviewsSnapshot.empty) {
    return 'This product has reviews and cannot be permanently deleted. Archive it to preserve its history.';
  }

  return null;
}
