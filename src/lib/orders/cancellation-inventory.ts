import type { OrderItem } from '@/types';

type InventoryVariant = Record<string, unknown> & { sku: string; stock: number };

export type CancellationInventoryResult =
  | { ok: true; updates: Map<string, Record<string, unknown>> }
  | { ok: false; error: string };

/**
 * Builds one restoration update per product from the immutable order lines.
 * Checkout keeps parent stock as an aggregate counter and also decrements each
 * selected variant, so cancellation must restore both using the same totals.
 */
export function buildCancellationInventoryUpdates(
  items: OrderItem[],
  products: Map<string, Record<string, unknown>>,
  now: string,
): CancellationInventoryResult {
  const grouped = new Map<string, { quantity: number; variants: Map<string, number>; unkeyedQuantity: number }>();

  for (const item of items) {
    if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      return { ok: false, error: 'Order contains invalid inventory quantities.' };
    }
    const group = grouped.get(item.productId) || { quantity: 0, variants: new Map<string, number>(), unkeyedQuantity: 0 };
    group.quantity += item.quantity;
    if (!Number.isSafeInteger(group.quantity)) {
      return { ok: false, error: `Order quantity for ${item.productId} exceeds the safe inventory range.` };
    }
    if (item.variantSku) {
      group.variants.set(item.variantSku, (group.variants.get(item.variantSku) || 0) + item.quantity);
    } else group.unkeyedQuantity += item.quantity;
    grouped.set(item.productId, group);
  }

  const updates = new Map<string, Record<string, unknown>>();
  for (const [productId, group] of grouped) {
    const product = products.get(productId);
    if (!product) return { ok: false, error: `Product ${productId} is unavailable for inventory restoration.` };
    if (!Number.isSafeInteger(product.stock) || Number(product.stock) < 0) {
      return { ok: false, error: `Product ${productId} has invalid parent stock.` };
    }
    if (!Number.isSafeInteger(Number(product.stock) + group.quantity)) {
      return { ok: false, error: `Restored parent stock for ${productId} exceeds the safe inventory range.` };
    }

    const rawVariants = product.variants;
    const hasVariants = product.hasVariants === true || (Array.isArray(rawVariants) && rawVariants.length > 0);
    const payload: Record<string, unknown> = {
      stock: Number(product.stock) + group.quantity,
      updatedAt: now,
    };
    const salesCount = product.salesCount;
    if (typeof salesCount === 'number' && Number.isFinite(salesCount)) {
      payload.salesCount = Math.max(0, salesCount - group.quantity);
    }

    if (hasVariants) {
      if (group.unkeyedQuantity > 0) {
        return { ok: false, error: `Order does not identify the purchased variant for ${productId}.` };
      }
      if (!Array.isArray(rawVariants)) {
        return { ok: false, error: `Product ${productId} has no readable variant inventory.` };
      }
      const variants = rawVariants as InventoryVariant[];
      const seenSkus = new Set<string>();
      for (const variant of variants) {
        if (typeof variant?.sku !== 'string' || seenSkus.has(variant.sku)) {
          return { ok: false, error: `Product ${productId} has ambiguous variant SKUs.` };
        }
        seenSkus.add(variant.sku);
      }
      for (const variantSku of group.variants.keys()) {
        if (variants.filter((variant) => variant.sku === variantSku).length !== 1) {
          return { ok: false, error: `Purchased variant ${variantSku} is unavailable for inventory restoration.` };
        }
      }
      const restoredVariants: InventoryVariant[] = [];
      for (const variant of variants) {
        const quantity = group.variants.get(variant.sku) || 0;
        if (quantity > 0 && (!Number.isSafeInteger(variant.stock) || variant.stock < 0)) {
          return { ok: false, error: `Variant ${variant.sku} on product ${productId} has invalid stock.` };
        }
        if (quantity > 0 && !Number.isSafeInteger(variant.stock + quantity)) {
          return { ok: false, error: `Restored variant stock for ${variant.sku} exceeds the safe inventory range.` };
        }
        restoredVariants.push(quantity > 0 ? { ...variant, stock: variant.stock + quantity } : variant);
      }
      payload.variants = restoredVariants;
    } else if (group.variants.size > 0) {
      return { ok: false, error: `Purchased variant is no longer present on product ${productId}.` };
    }

    updates.set(productId, payload);
  }

  return { ok: true, updates };
}
