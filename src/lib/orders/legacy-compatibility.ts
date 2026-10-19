import type { Order } from '@/types';

/**
 * Checks whether a seller participates in an order.
 * If `sellerIds` is present as an array, checks for membership.
 * If `sellerIds` is absent (legacy order), checks whether any line item belongs to this seller.
 * Crucially, an order is NEVER permitted merely because `sellerIds` is absent.
 */
export function isSellerParticipantInOrder(
  order: { sellerIds?: string[]; items?: Array<{ sellerId?: string }> } | null | undefined,
  sellerId: string
): boolean {
  if (!order || !sellerId) {
    return false;
  }

  if (Array.isArray(order.sellerIds)) {
    return order.sellerIds.includes(sellerId);
  }

  if (Array.isArray(order.items)) {
    return order.items.some((item) => item && item.sellerId === sellerId);
  }

  return false;
}

/**
 * Derives a deduplicated array of seller IDs from an order's line items.
 */
export function deriveSellerIdsFromItems(
  items: Array<{ sellerId?: string }> | null | undefined
): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const ids = new Set<string>();
  for (const item of items) {
    if (item && typeof item.sellerId === 'string' && item.sellerId.trim().length > 0) {
      ids.add(item.sellerId.trim());
    }
  }

  return Array.from(ids);
}

/**
 * Merges primary indexed orders with legacy orders that lack the `sellerIds` array,
 * ensuring no duplicates and strictly enforcing vendor participation.
 */
export function mergeLegacyOrders(
  primaryOrders: Order[],
  candidateOrders: Order[],
  sellerId: string
): Order[] {
  const existingIds = new Set(primaryOrders.map((o) => o.id));
  const merged = [...primaryOrders];

  for (const candidate of candidateOrders) {
    if (!existingIds.has(candidate.id)) {
      if (isSellerParticipantInOrder(candidate, sellerId)) {
        merged.push(candidate);
        existingIds.add(candidate.id);
      }
    }
  }

  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
