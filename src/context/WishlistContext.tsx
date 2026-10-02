'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import type { WishlistItem } from '@/types';

interface WishlistContextType {
  items: WishlistItem[];
  itemCount: number;
  isInWishlist: (productId: string) => boolean;
  toggleWishlist: (item: Omit<WishlistItem, 'addedAt'>) => void;
  removeItem: (productId: string) => void;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

const WISHLIST_STORAGE_KEY = 'casaio_guest_wishlist';

function serializeWishlistItems(items: WishlistItem[]) {
  return items.map(({ compareAtPrice, ...item }) => ({
    ...item,
    ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
  }));
}

function readStoredWishlistItems(): WishlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);

  // Load local storage after hydration to keep server and client markup aligned.
  useEffect(() => {
    const timer = window.setTimeout(() => setItems(readStoredWishlistItems()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Sync with Firestore when User is authenticated
  useEffect(() => {
    if (!user) return;

    const currentUserId = user.uid;
    const wishlistRef = doc(db, 'wishlists', currentUserId);

    async function syncFirestoreWishlist() {
      try {
        const snap = await getDoc(wishlistRef);
        if (snap.exists()) {
          const remoteData = snap.data();
          const remoteItems: WishlistItem[] = Array.isArray(remoteData.items) ? remoteData.items : [];

          setItems((currentLocal) => {
            const mergedMap = new Map<string, WishlistItem>();
            remoteItems.forEach((ri) => mergedMap.set(ri.productId, ri));
            currentLocal.forEach((li) => mergedMap.set(li.productId, li));

            const merged = Array.from(mergedMap.values());
            try {
              localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(merged));
            } catch {}

            setDoc(wishlistRef, {
              userId: currentUserId,
              items: serializeWishlistItems(merged),
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});

            return merged;
          });
        }
      } catch {
        // Fallback gracefully if offline
      }
    }

    syncFirestoreWishlist();
  }, [user]);

  // 3. Persist Helper
  const persistItems = useCallback(
    (newItems: WishlistItem[]) => {
      setItems(newItems);
      try {
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(newItems));
      } catch {}

      if (user) {
        const wishlistRef = doc(db, 'wishlists', user.uid);
        setDoc(wishlistRef, {
          userId: user.uid,
          items: serializeWishlistItems(newItems),
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    },
    [user]
  );

  // 4. Mutations
  const isInWishlist = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const toggleWishlist = useCallback(
    (item: Omit<WishlistItem, 'addedAt'>) => {
      const exists = items.some((i) => i.productId === item.productId);
      if (exists) {
        const updated = items.filter((i) => i.productId !== item.productId);
        persistItems(updated);
      } else {
        const newItem: WishlistItem = {
          ...item,
          addedAt: new Date().toISOString(),
        };
        persistItems([...items, newItem]);
      }
    },
    [items, persistItems]
  );

  const removeItem = useCallback(
    (productId: string) => {
      const updated = items.filter((i) => i.productId !== productId);
      persistItems(updated);
    },
    [items, persistItems]
  );

  const clearWishlist = useCallback(() => {
    persistItems([]);
  }, [persistItems]);

  const itemCount = useMemo(() => items.length, [items]);

  return (
    <WishlistContext.Provider
      value={{
        items,
        itemCount,
        isInWishlist,
        toggleWishlist,
        removeItem,
        clearWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = (): WishlistContextType => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
