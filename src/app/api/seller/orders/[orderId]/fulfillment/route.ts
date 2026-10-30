import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import type { FulfillmentStatus, OrderStatus, OrderItem } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { getCouponUserUsageRefs } from '@/lib/coupons/user-usage';
import {
  isValidFulfillmentTransition,
  computeOverallOrderStatus,
  validatePaymentForFulfillment,
  VALID_FULFILLMENT_STATUSES,
} from '@/lib/orders/fulfillment-validation';
import {
  isSellerParticipantInOrder,
  deriveSellerIdsFromItems,
} from '@/lib/orders/legacy-compatibility';

interface TransactionError extends Error {
  statusCode?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });

    // Enforce authoritative seller approval status (admins bypass this check)
    if (user.role !== 'admin') {
      const sellerSnap = await adminDb.collection('sellers').doc(user.uid).get();
      if (!sellerSnap.exists || sellerSnap.data()?.status !== 'approved') {
        return NextResponse.json(
          { error: 'An approved seller profile is required to fulfill orders' },
          { status: 403 }
        );
      }
    }

    const { orderId } = await params;
    const body = await req.json();
    const {
      productId,
      fulfillmentStatus,
      carrier,
      trackingNumber,
      trackingUrl,
      estimatedDelivery,
    } = body;
    const sellerId = user.uid;

    if (!sellerId || !fulfillmentStatus) {
      return NextResponse.json(
        { error: 'Seller ID and fulfillment status are required' },
        { status: 400 }
      );
    }
    if (!VALID_FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
      return NextResponse.json({ error: 'Invalid fulfillment status' }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = new Date().toISOString();

    // Use a Firestore transaction to prevent lost updates when multiple vendors
    // update line items on the same order concurrently.
    const result = await adminDb.runTransaction(async (transaction: Transaction) => {
      const snap = await transaction.get(orderRef);

      if (!snap.exists) {
        const err: TransactionError = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      const orderData = snap.data();

      if (orderData?.orderStatus === 'cancelled' || orderData?.cancellationStatus === 'processing') {
        const err: TransactionError = new Error('This order is cancelled or being cancelled');
        err.statusCode = 409;
        throw err;
      }

      // Block fulfillment of unpaid online orders using fresh transaction snapshot data
      const paymentCheck = validatePaymentForFulfillment(orderData?.payment, fulfillmentStatus);
      if (!paymentCheck.allowed) {
        const err: TransactionError = new Error(paymentCheck.reason);
        err.statusCode = 400;
        throw err;
      }

      // Verify seller participation: check sellerIds array if present, or fallback to line items for legacy orders
      const isSellerParticipant = isSellerParticipantInOrder(orderData, sellerId);

      if (user.role !== 'admin' && !isSellerParticipant) {
        const err: TransactionError = new Error('Unauthorized: you are not a vendor for this order');
        err.statusCode = 403;
        throw err;
      }

      // Validate transitions and update matching items
      let updatedAny = false;
      const items = (orderData?.items || []).map((item: OrderItem) => {
        // If productId specified, update only that product; otherwise update all items for this seller
        const isTargetItem =
          (user.role === 'admin' || item.sellerId === sellerId) &&
          (!productId || item.productId === productId);

        if (isTargetItem) {
          updatedAny = true;
          const currentStatus: FulfillmentStatus = item.fulfillmentStatus || 'pending';
          const transitionCheck = isValidFulfillmentTransition(currentStatus, fulfillmentStatus);

          if (!transitionCheck.valid) {
            const err: TransactionError = new Error(
              transitionCheck.reason || `Invalid fulfillment transition for product "${item.title}"`
            );
            err.statusCode = 400;
            throw err;
          }

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
        const err: TransactionError = new Error('No matching items found for this seller');
        err.statusCode = 400;
        throw err;
      }

      // Derive aggregate orderStatus across all items using pure domain rules
      const newOrderStatus: OrderStatus = computeOverallOrderStatus(
        items,
        orderData?.orderStatus || 'pending'
      );

      let deliveredCouponReservation: DocumentReference | null = null;
      let consumeDeliveredCouponSlot = false;
      const couponId = orderData?.couponApplied?.couponId;
      if (newOrderStatus === 'delivered' && orderData?.payment?.method === 'cod' &&
          typeof couponId === 'string' && typeof orderData?.customerId === 'string') {
        const refs = getCouponUserUsageRefs(adminDb, couponId, orderData.customerId, orderId);
        const [usageSnap, reservationSnap] = await Promise.all([
          transaction.get(refs.usageRef),
          transaction.get(refs.reservationRef),
        ]);
        if (usageSnap.exists || reservationSnap.exists) {
          if (!usageSnap.exists || usageSnap.data()?.state !== 'ready' || !reservationSnap.exists) {
            const err: TransactionError = new Error('Coupon usage requires reconciliation before delivery can be recorded');
            err.statusCode = 409;
            throw err;
          }
          const reservation = reservationSnap.data();
          if (reservation?.couponId !== couponId || reservation?.customerId !== orderData.customerId ||
              reservation?.orderId !== orderId) {
            const err: TransactionError = new Error('Coupon delivery reservation does not match the order');
            err.statusCode = 409;
            throw err;
          }
          if (reservation.state === 'awaiting_delivery') {
            deliveredCouponReservation = refs.reservationRef;
            consumeDeliveredCouponSlot = true;
          } else if (reservation.state !== 'consumed') {
            const err: TransactionError = new Error('Coupon delivery reservation is not available');
            err.statusCode = 409;
            throw err;
          }
        }
      }

      // Append milestone event to timeline
      const timelineEvent = {
        status: fulfillmentStatus,
        timestamp: now,
        note: `Vendor dispatched milestone update: status set to "${fulfillmentStatus}"${
          trackingNumber ? ` via ${carrier || 'Courier'} (Tracking: ${trackingNumber})` : ''
        }.`,
        updatedBy: sellerId,
      };

      const updatedTimeline = [...(orderData?.statusTimeline || []), timelineEvent];

      const orderUpdates: Record<string, unknown> = {
        items,
        orderStatus: newOrderStatus,
        statusTimeline: updatedTimeline,
        updatedAt: now,
      };

      // Opportunistically backfill sellerIds on legacy orders
      if (!Array.isArray(orderData?.sellerIds)) {
        orderUpdates.sellerIds = deriveSellerIdsFromItems(items);
      }

      transaction.update(orderRef, orderUpdates);
      if (consumeDeliveredCouponSlot && deliveredCouponReservation) {
        transaction.update(deliveredCouponReservation, { state: 'consumed', updatedAt: now });
      }

      return {
        orderData,
        newOrderStatus,
      };
    });

    // Notify customer about fulfillment progress (non-blocking)
    if (result.orderData?.customerId) {
      try {
        await adminDb.collection('notifications').add({
          userId: result.orderData.customerId,
          title: `Shipment Update: #${result.orderData.orderNumber || orderId.slice(0, 8)}`,
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
      orderStatus: result.newOrderStatus,
    });
  } catch (error: unknown) {
    console.error('Order fulfillment update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update order fulfillment';
    const status = (error as TransactionError)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
