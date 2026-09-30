'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CartItem } from '@/types';

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

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'casaio_guest_cart';

function getInitialCartItems(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>(getInitialCartItems);
  const [isOpen, setIsOpen] = useState(false);

  // Sync with Firestore when User is authenticated
  useEffect(() => {
    if (!user) return;

    const currentUserId = user.uid;
    const cartRef = doc(db, 'carts', currentUserId);

    async function syncFirestoreCart() {
      try {
        const snap = await getDoc(cartRef);
        if (snap.exists()) {
          const remoteCart = snap.data();
          const remoteItems: CartItem[] = Array.isArray(remoteCart.items) ? remoteCart.items : [];

          // Merge guest local items with remote items
          setItems((currentLocal) => {
            const mergedMap = new Map<string, CartItem>();

            // Put remote items first
            remoteItems.forEach((ri) => {
              const key = ri.variantSku ? `${ri.productId}-${ri.variantSku}` : ri.productId;
              mergedMap.set(key, { ...ri });
            });

            // Merge local items
            currentLocal.forEach((li) => {
              const key = li.variantSku ? `${li.productId}-${li.variantSku}` : li.productId;
              const existing = mergedMap.get(key);
              if (existing) {
                const combinedQty = Math.min(existing.quantity + li.quantity, li.maxStock || 99);
                mergedMap.set(key, { ...existing, quantity: combinedQty });
              } else {
                mergedMap.set(key, { ...li });
              }
            });

            const merged = Array.from(mergedMap.values());
            // Persist merged to Firestore and LocalStorage
            try {
              localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(merged));
            } catch {}

            setDoc(cartRef, {
              userId: currentUserId,
              items: merged,
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});

            return merged;
          });
        }
      } catch {
        // Fallback gracefully if firestore is offline
      }
    }

    syncFirestoreCart();
  }, [user]);

  // 3. Save to LocalStorage and Firestore on state change
  const persistItems = useCallback(
    (newItems: CartItem[]) => {
      setItems(newItems);
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newItems));
      } catch {
        // Storage quota / privacy mode
      }

      if (user) {
        const cartRef = doc(db, 'carts', user.uid);
        setDoc(cartRef, {
          userId: user.uid,
          items: newItems,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    },
    [user]
  );

  // 4. Cart Mutations
  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
      setItems((prev) => {
        const itemKey = item.variantSku ? `${item.productId}-${item.variantSku}` : item.productId;
        const index = prev.findIndex((i) => {
          const k = i.variantSku ? `${i.productId}-${i.variantSku}` : i.productId;
          return k === itemKey;
        });

        let updated: CartItem[];
        if (index > -1) {
          const existing = prev[index];
          const newQty = Math.min(existing.quantity + quantity, item.maxStock || 99);
          updated = [...prev];
          updated[index] = { ...existing, quantity: newQty };
        } else {
          const newQty = Math.min(quantity, item.maxStock || 99);
          updated = [...prev, { ...item, quantity: newQty }];
        }

        try {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
        } catch {}

        if (user) {
          const cartRef = doc(db, 'carts', user.uid);
          setDoc(cartRef, {
            userId: user.uid,
            items: updated,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }

        return updated;
      });

      setIsOpen(true);
    },
    [user]
  );

  const removeItem = useCallback(
    (productId: string, variantSku?: string) => {
      const updated = items.filter((i) => {
        if (variantSku) {
          return !(i.productId === productId && i.variantSku === variantSku);
        }
        return i.productId !== productId;
      });
      persistItems(updated);
    },
    [items, persistItems]
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantSku?: string) => {
      if (quantity <= 0) {
        removeItem(productId, variantSku);
        return;
      }

      const updated = items.map((i) => {
        const matches = variantSku
          ? i.productId === productId && i.variantSku === variantSku
          : i.productId === productId;

        if (matches) {
          const clampedQty = Math.min(quantity, i.maxStock || 99);
          return { ...i, quantity: clampedQty };
        }
        return i;
      });

      persistItems(updated);
    },
    [items, removeItem, persistItems]
  );

  const clearCart = useCallback(() => {
    persistItems([]);
  }, [persistItems]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  // 5. Calculations
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [items]
  );

  // Free insured dropship shipping across platform
  const shipping = 0;

  // Taxes are inclusive in retail dropship pricing in India (GST)
  const tax = useMemo(() => Math.round(subtotal * 0.18), [subtotal]);

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
