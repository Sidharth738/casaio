'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CartItem } from '@/types';
import { getInclusiveGstBreakdown } from '@/lib/orders/checkout-validation';
import { calculateItemsSubtotal } from '@/lib/orders/money';
import {
  applyCartOperation,
  getCartOwnerKey,
  GUEST_CART_STORAGE_KEY,
  resolveAuthenticatedCart,
  type CartOperation,
  type GuestCartSnapshot,
} from '@/lib/cart/cart-state';

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (productId: string, variantSku?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantSku?: string) => void;
  clearCart: () => void;
}

type CartState = { ownerKey: string | null; items: CartItem[] };

const CartContext = createContext<CartContextType | undefined>(undefined);

function readGuestCart(): GuestCartSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<GuestCartSnapshot>;
    if (typeof parsed.migrationId !== 'string' || !Array.isArray(parsed.items)) return null;
    return { migrationId: parsed.migrationId, items: parsed.items as CartItem[] };
  } catch {
    return null;
  }
}

function persistGuestCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      return;
    }
    const existing = readGuestCart();
    const snapshot: GuestCartSnapshot = {
      migrationId: existing?.migrationId || crypto.randomUUID(),
      items,
    };
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep guest cart actions usable when browser storage is unavailable.
  }
}

function clearGuestCartIfUnchanged(migrationId: string) {
  if (typeof window === 'undefined') return;
  try {
    if (readGuestCart()?.migrationId === migrationId) {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    }
  } catch {
    // A retained guest snapshot is harmless: Firestore records the migration ID.
  }
}

function serializeCartItems(items: CartItem[]) {
  return items.map(({ variantSku, compareAtPrice, ...item }) => ({
    ...item,
    ...(variantSku ? { variantSku } : {}),
    ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
  }));
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.uid;
  const ownerKey = authLoading ? null : getCartOwnerKey(userId);
  const [cartState, setCartState] = useState<CartState>({ ownerKey: null, items: [] });
  const [isOpen, setIsOpen] = useState(false);
  const cartStateRef = useRef(cartState);
  const hydrationGeneration = useRef(0);
  const userTaskQueues = useRef(new Map<string, Promise<void>>());

  const publishCart = useCallback((nextState: CartState) => {
    cartStateRef.current = nextState;
    setCartState(nextState);
  }, []);

  const enqueueUserTask = useCallback(<T,>(currentUserId: string, task: () => Promise<T>) => {
    const previous = userTaskQueues.current.get(currentUserId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    userTaskQueues.current.set(currentUserId, next.then(() => undefined, () => undefined));
    return next;
  }, []);

  // Resolve identity before reading storage. Authenticated carts come only from
  // that user's Firestore document; the guest cart has a separate storage key.
  useEffect(() => {
    if (authLoading || !ownerKey) return;
    const generation = ++hydrationGeneration.current;
    let active = true;

    if (!userId) {
      const guestItems = readGuestCart()?.items || [];
      void Promise.resolve().then(() => {
        if (active) publishCart({ ownerKey, items: guestItems });
      });
      return () => { active = false; };
    }

    const cartRef = doc(db, 'carts', userId);
    const guestCart = readGuestCart();
    void enqueueUserTask(userId, () => runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(cartRef);
      const remoteCart = snapshot.exists() ? snapshot.data() : null;
      const resolved = resolveAuthenticatedCart(remoteCart, guestCart);

      if (resolved.shouldMigrateGuestCart && guestCart) {
        transaction.set(cartRef, {
          userId,
          items: serializeCartItems(resolved.items),
          guestCartMigrationId: resolved.guestCartMigrationId,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      return { items: resolved.items, migratedGuestId: resolved.shouldMigrateGuestCart ? guestCart?.migrationId : undefined };
    })).then(({ items: remoteItems, migratedGuestId }) => {
      if (migratedGuestId) clearGuestCartIfUnchanged(migratedGuestId);
      if (active && hydrationGeneration.current === generation) {
        publishCart({ ownerKey, items: remoteItems });
      }
    }).catch(() => {
      if (active && hydrationGeneration.current === generation) publishCart({ ownerKey, items: [] });
      console.warn('Could not load the authenticated cart from Firestore.');
    });

    return () => { active = false; };
  }, [authLoading, userId, ownerKey, enqueueUserTask, publishCart]);

  const commitOperation = useCallback((operation: CartOperation) => {
    if (authLoading || !ownerKey) return;
    const currentItems = cartStateRef.current.ownerKey === ownerKey ? cartStateRef.current.items : [];
    const optimisticItems = applyCartOperation(currentItems, operation);
    publishCart({ ownerKey, items: optimisticItems });

    if (!userId) {
      persistGuestCart(optimisticItems);
      return;
    }

    const cartRef = doc(db, 'carts', userId);
    void enqueueUserTask(userId, () => runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(cartRef);
      const remoteItems: CartItem[] = snapshot.exists() && Array.isArray(snapshot.data().items)
        ? snapshot.data().items as CartItem[]
        : [];
      const updatedItems = applyCartOperation(remoteItems, operation);
      transaction.set(cartRef, {
        userId,
        items: serializeCartItems(updatedItems),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return updatedItems;
    })).then((canonicalItems) => {
      if (cartStateRef.current.ownerKey === ownerKey) {
        publishCart({ ownerKey, items: canonicalItems });
      }
    }).catch(() => {
      console.warn('Could not save the authenticated cart to Firestore.');
    });
  }, [authLoading, ownerKey, userId, enqueueUserTask, publishCart]);

  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
      commitOperation({ type: 'add', item, quantity });
      setIsOpen(true);
    },
    [commitOperation]
  );

  const removeItem = useCallback(
    (productId: string, variantSku?: string) => {
      commitOperation({ type: 'remove', productId, variantSku });
    },
    [commitOperation]
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantSku?: string) => {
      commitOperation({ type: 'set-quantity', productId, quantity, variantSku });
    },
    [commitOperation]
  );

  const clearCart = useCallback(() => {
    commitOperation({ type: 'clear' });
  }, [commitOperation]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const items = useMemo(
    () => ownerKey && cartState.ownerKey === ownerKey ? cartState.items : [],
    [ownerKey, cartState]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () => {
      try {
        return calculateItemsSubtotal(items);
      } catch {
        return 0;
      }
    },
    [items]
  );

  const shipping = 0;
  const tax = useMemo(() => getInclusiveGstBreakdown(subtotal).taxAmount, [subtotal]);
  const total = useMemo(() => subtotal + shipping, [subtotal, shipping]);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        shipping,
        tax,
        total,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
