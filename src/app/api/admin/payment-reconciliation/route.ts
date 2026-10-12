import { NextRequest, NextResponse } from 'next/server';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  const admin = await requireServerRole(request, ['admin']);
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });

  try {
    const snapshot = await adminDb.collection('orders')
      .where('payment.reconciliationRequired', '==', true)
      .limit(100)
      .get();

    return NextResponse.json({
      cases: snapshot.docs.map((document) => {
        const order = document.data();
        return {
          orderId: document.id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          payment: {
            method: order.payment?.method,
            status: order.payment?.status,
            razorpayOrderId: order.payment?.razorpayOrderId,
            razorpayPaymentId: order.payment?.razorpayPaymentId,
            razorpayAuthorizedPaymentId: order.payment?.razorpayAuthorizedPaymentId,
            reconciliationReason: order.payment?.reconciliationReason,
            reconciliationPaymentIds: order.payment?.reconciliationPaymentIds || [],
            reconciliationStatus: order.payment?.reconciliationStatus || 'open',
          },
          items: Array.isArray(order.items)
            ? order.items.map((item: { productId?: string; title?: string; quantity?: number; fulfillmentStatus?: string }) => ({
                productId: item.productId,
                title: item.title,
                quantity: item.quantity,
                fulfillmentStatus: item.fulfillmentStatus,
              }))
            : [],
          updatedAt: order.updatedAt,
        };
      }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Payment reconciliation case lookup failed');
    return NextResponse.json({ error: 'Unable to load payment reconciliation cases' }, { status: 500 });
  }
}
