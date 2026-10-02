import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { OrderStatus } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await requireServerRole(req, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const { orderStatus, note } = body as {
      orderStatus: OrderStatus;
      note?: string;
    };

    if (!orderStatus) {
      return NextResponse.json({ error: 'Order status is required' }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(id);
    const snap = await orderRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = snap.data();
    const now = new Date().toISOString();

    const timelineEvent = {
      status: orderStatus,
      timestamp: now,
      note: note || `Admin platform override: Order status set to "${orderStatus}".`,
      updatedBy: 'admin',
    };

    const updatedTimeline = [...(orderData?.statusTimeline || []), timelineEvent];

    await orderRef.update({
      orderStatus,
      statusTimeline: updatedTimeline,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      message: `Order status overridden to "${orderStatus}"`,
    });
  } catch (error: unknown) {
    console.error('Admin order status update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update order status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
