import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import type { Order } from '@/types';
import { projectSellerOrders } from '@/lib/orders/seller-projection';
import { mergeLegacyOrders } from '@/lib/orders/legacy-compatibility';

export async function GET(req: NextRequest) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) {
      return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const requestedSellerId = searchParams.get('sellerId');
    const scanLegacy =
      searchParams.get('scanLegacy') === 'true' || searchParams.get('includeLegacy') === 'true';
    const legacyCursor = searchParams.get('legacyCursor');
    const legacyLimitParam = parseInt(searchParams.get('legacyLimit') || '50', 10);
    const legacyLimit = isNaN(legacyLimitParam)
      ? 50
      : Math.min(Math.max(legacyLimitParam, 1), 100);

    // Admins can query for any specific seller; sellers can query only their own orders
    const effectiveSellerId =
      user.role === 'admin' && requestedSellerId ? requestedSellerId : user.uid;

    if (user.role !== 'admin') {
      const sellerSnap = await adminDb.collection('sellers').doc(effectiveSellerId).get();
      if (!sellerSnap.exists || sellerSnap.data()?.status !== 'approved') {
        return NextResponse.json(
          { error: 'An approved seller profile is required to view orders' },
          { status: 403 }
        );
      }
    }

    const primarySnapshot = await adminDb
      .collection('orders')
      .where('sellerIds', 'array-contains', effectiveSellerId)
      .get();

    const primaryOrders: Order[] = primarySnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Order)
    );

    // Fallback: Query legacy orders missing sellerIds when explicitly requested (supports
    // cursor pagination) or as a graceful fallback when the seller has 0 primary indexed orders.
    // Avoids burning repeated reads on every dashboard refresh for sellers with indexed orders.
    let allOrders = primaryOrders;
    let nextLegacyCursor: string | null = null;

    if (scanLegacy || primaryOrders.length === 0 || legacyCursor) {
      try {
        let legacyQuery = adminDb
          .collection('orders')
          .orderBy('createdAt', 'desc')
          .limit(legacyLimit);

        if (legacyCursor) {
          legacyQuery = legacyQuery.startAfter(legacyCursor);
        }

        const recentSnapshot = await legacyQuery.get();

        if (!recentSnapshot.empty) {
          const lastDoc = recentSnapshot.docs[recentSnapshot.docs.length - 1];
          const lastCreatedAt = lastDoc.data()?.createdAt;
          if (typeof lastCreatedAt === 'string') {
            nextLegacyCursor = lastCreatedAt;
          }
        }

        const candidateOrders: Order[] = recentSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Order))
          .filter((order) => !Array.isArray(order.sellerIds));

        allOrders = mergeLegacyOrders(primaryOrders, candidateOrders, effectiveSellerId);
      } catch {
        // If createdAt index is missing or ordering fails, use primary indexed orders
        allOrders = primaryOrders;
      }
    }

    // Project orders to seller-scoped views:
    // Strips other vendors' items, overall order pricing, coupon details, payment secrets, and unnecessary customer metadata.
    const sellerOrders = projectSellerOrders(allOrders, effectiveSellerId);

    return NextResponse.json({
      orders: sellerOrders,
      ...(nextLegacyCursor ? { nextLegacyCursor } : {}),
    });
  } catch (error: unknown) {
    console.error('Seller orders fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to retrieve seller orders';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
