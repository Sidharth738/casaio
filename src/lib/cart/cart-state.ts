import type { CartItem } from '@/types';

export const GUEST_CART_STORAGE_KEY = 'casaio_guest_cart_v2';

export type GuestCartSnapshot = {
  migrationId: string;
  items: CartItem[];
};

export type CartOperation =
  | { type: 'add'; item: Omit<CartItem, 'quantity'>; quantity: number }
  | { type: 'set-quantity'; productId: string; quantity: number; variantSku?: string }
  | { type: 'remove'; productId: string; variantSku?: string }
  | { type: 'clear' };

export type AuthenticatedCartDocument = {
  items?: unknown;
  guestCartMigrationId?: unknown;
};

export function getCartOwnerKey(userId?: string | null) {
  return userId ? `user:${userId}` : 'guest';
}

function getItemKey(item: Pick<CartItem, 'productId' | 'variantSku'>) {
  return JSON.stringify([item.productId, item.variantSku || '']);
}

export function mergeCartItems(baseItems: CartItem[], additionalItems: CartItem[]) {
  const merged = new Map<string, CartItem>();

  for (const item of baseItems) merged.set(getItemKey(item), { ...item });

  for (const item of additionalItems) {
    const key = getItemKey(item);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }

    merged.set(key, {
      ...existing,
      quantity: Math.min(existing.quantity + item.quantity, item.maxStock || 99),
    });
  }

  return Array.from(merged.values());
}

export function applyCartOperation(items: CartItem[], operation: CartOperation): CartItem[] {
  if (operation.type === 'clear') return [];

  if (operation.type === 'add') {
    const itemKey = getItemKey(operation.item);
    const index = items.findIndex((item) => getItemKey(item) === itemKey);
    if (index < 0) {
      return [...items, {
        ...operation.item,
        quantity: Math.min(operation.quantity, operation.item.maxStock || 99),
      }];
    }

    const updated = [...items];
    const existing = items[index];
    updated[index] = {
      ...existing,
      quantity: Math.min(existing.quantity + operation.quantity, operation.item.maxStock || 99),
    };
    return updated;
  }

  if (operation.type === 'remove') {
    return items.filter((item) => {
      const matchesProduct = item.productId === operation.productId;
      const matchesVariant = !operation.variantSku || item.variantSku === operation.variantSku;
      return !(matchesProduct && matchesVariant);
    });
  }

  if (operation.quantity <= 0) {
    return items.filter((item) => {
      const matchesProduct = item.productId === operation.productId;
      const matchesVariant = !operation.variantSku || item.variantSku === operation.variantSku;
      return !(matchesProduct && matchesVariant);
    });
  }

  return items.map((item) => {
    const matchesProduct = item.productId === operation.productId;
    const matchesVariant = !operation.variantSku || item.variantSku === operation.variantSku;
    return matchesProduct && matchesVariant
      ? { ...item, quantity: Math.min(operation.quantity, item.maxStock || 99) }
      : item;
  });
}

export function resolveAuthenticatedCart(
  remoteCart: AuthenticatedCartDocument | null,
  guestCart: GuestCartSnapshot | null,
) {
  const remoteItems = remoteCart && Array.isArray(remoteCart.items)
    ? remoteCart.items as CartItem[]
    : [];
  const alreadyMigrated = Boolean(guestCart && remoteCart?.guestCartMigrationId === guestCart.migrationId);
  const shouldMigrateGuestCart = Boolean(guestCart && guestCart.items.length > 0 && !alreadyMigrated);

  return {
    items: shouldMigrateGuestCart ? mergeCartItems(remoteItems, guestCart!.items) : remoteItems,
    guestCartMigrationId: shouldMigrateGuestCart
      ? guestCart!.migrationId
      : typeof remoteCart?.guestCartMigrationId === 'string'
        ? remoteCart.guestCartMigrationId
        : undefined,
    shouldMigrateGuestCart,
  };
}
