import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import type { Order } from '@/types';
import { projectSellerOrder } from '@/lib/orders/seller-projection';
import { isSellerParticipantInOrder } from '@/lib/orders/legacy-compatibility';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) {
      return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    }

    const { orderId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const requestedSellerId = searchParams.get('sellerId');

    const effectiveSellerId =
      user.role === 'admin' && requestedSellerId ? requestedSellerId : user.uid;

    if (user.role !== 'admin') {
      const sellerSnap = await adminDb.collection('sellers').doc(effectiveSellerId).get();
      if (!sellerSnap.exists || sellerSnap.data()?.status !== 'approved') {
        return NextResponse.json(
          { error: 'An approved seller profile is required to view order details' },
          { status: 403 }
        );
      }
    }

    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = { id: orderSnap.id, ...orderSnap.data() } as Order;

    // Explicit seller participation check for both modern and legacy orders
    if (user.role !== 'admin' && !isSellerParticipantInOrder(orderData, effectiveSellerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: you are not a vendor for this order' },
        { status: 403 }
      );
    }

    // Project raw order to seller-scoped view:
    // Guarantees only this seller's line items and the minimum customer fulfillment details are exposed.
    const sellerOrder = projectSellerOrder(orderData, effectiveSellerId);

    if (!sellerOrder) {
      return NextResponse.json(
        { error: 'Unauthorized: you are not a vendor for this order' },
        { status: 403 }
      );
    }

    return NextResponse.json({ order: sellerOrder });
  } catch (error: unknown) {
    console.error('Seller order detail fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to retrieve order details';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
