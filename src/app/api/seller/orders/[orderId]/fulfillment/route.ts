import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { FulfillmentStatus, OrderStatus, OrderItem } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await req.json();
    const {
      sellerId,
      productId,
      fulfillmentStatus,
      carrier,
      trackingNumber,
      trackingUrl,
      estimatedDelivery,
    } = body;

    if (!sellerId || !fulfillmentStatus) {
      return NextResponse.json(
        { error: 'Seller ID and fulfillment status are required' },
        { status: 400 }
      );
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = snap.data();
    const now = new Date().toISOString();

    // Verify seller is part of this order
    if (
      !Array.isArray(orderData?.sellerIds) ||
      !orderData.sellerIds.includes(sellerId)
    ) {
      return NextResponse.json(
        { error: 'Unauthorized: you are not a vendor for this order' },
        { status: 403 }
      );
    }

    // Update matching items in the order
    let updatedAny = false;
    const items = (orderData?.items || []).map((item: OrderItem) => {
      // If productId specified, update only that product, else update all items for this seller
      if (
        item.sellerId === sellerId &&
        (!productId || item.productId === productId)
      ) {
        updatedAny = true;
        const updatedTracking = {
          ...(item.trackingDetails || {}),
          carrier: carrier || item.trackingDetails?.carrier || 'Express Air Cargo',
          trackingNumber: trackingNumber || item.trackingDetails?.trackingNumber || '',
          trackingUrl: trackingUrl || item.trackingDetails?.trackingUrl || '',
          estimatedDelivery: estimatedDelivery || item.trackingDetails?.estimatedDelivery || '',
          ...(fulfillmentStatus === 'shipped' ? { shippedAt: now } : {}),
        };

        return {
          ...item,
          fulfillmentStatus: fulfillmentStatus as FulfillmentStatus,
          trackingDetails: updatedTracking,
        };
      }
      return item;
    });

    if (!updatedAny) {
      return NextResponse.json(
        { error: 'No matching items found for this seller' },
        { status: 400 }
      );
    }

    // Determine overall orderStatus: if all items are delivered -> delivered, if all items shipped -> shipped, etc.
    let newOrderStatus: OrderStatus = orderData?.orderStatus;
    const allItemsShipped = items.every(
      (i: OrderItem) => i.fulfillmentStatus === 'shipped' || i.fulfillmentStatus === 'delivered'
    );
    const allItemsDelivered = items.every((i: OrderItem) => i.fulfillmentStatus === 'delivered');

    if (allItemsDelivered) {
      newOrderStatus = 'delivered';
    } else if (allItemsShipped) {
      newOrderStatus = 'shipped';
    } else if (fulfillmentStatus === 'processing' && newOrderStatus === 'pending') {
      newOrderStatus = 'processing';
    }

    // Add event to timeline
    const timelineEvent = {
      status: fulfillmentStatus,
      timestamp: now,
      note: `Vendor dispatched milestone update: status set to "${fulfillmentStatus}"${
        trackingNumber ? ` via ${carrier || 'Courier'} (Tracking: ${trackingNumber})` : ''
      }.`,
      updatedBy: sellerId,
    };

    const updatedTimeline = [...(orderData?.statusTimeline || []), timelineEvent];

    await orderRef.update({
      items,
      orderStatus: newOrderStatus,
      statusTimeline: updatedTimeline,
      updatedAt: now,
    });

    // Notify customer about fulfillment progress
    if (orderData?.customerId) {
      try {
        await adminDb.collection('notifications').add({
          userId: orderData.customerId,
          title: `Shipment Update: #${orderData.orderNumber || orderId.slice(0, 8)}`,
          message: `Your item has been marked as "${fulfillmentStatus}".${
            trackingNumber ? ` Tracking #${trackingNumber} via ${carrier || 'Courier'}.` : ''
          }`,
          type: 'order',
          link: `/account/orders/${orderId}`,
          read: false,
          createdAt: now,
        });
      } catch (notifErr) {
        console.warn('Failed creating customer fulfillment notification:', notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Fulfillment and tracking details updated',
      orderStatus: newOrderStatus,
    });
  } catch (error: unknown) {
    console.error('Order fulfillment update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update order fulfillment';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
