import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { getPaymentConfirmationState } from '@/lib/payment/confirmation-state';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireServerUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { orderId } = await params;
    if (!orderId || orderId.length > 150) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const snapshot = await adminDb.collection('orders').doc(orderId).get();
    const order = snapshot.data();
    if (!snapshot.exists || order?.customerId !== user.uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      orderId,
      confirmationState: getPaymentConfirmationState(order),
      paymentStatus: order.payment?.status || 'pending',
      orderStatus: order.orderStatus || 'pending',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Owned order payment status lookup failed');
    return NextResponse.json({ error: 'Unable to check order status' }, { status: 500 });
  }
}
