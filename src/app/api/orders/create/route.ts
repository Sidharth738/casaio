import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderPayment,
  PaymentMethod,
  PaymentStatus,
} from '@/types';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef, isCheckoutCoordinationFresh } from '@/lib/payment/attempts';
import { calculateItemsSubtotal } from '@/lib/orders/money';
import {
  getCouponUserUsageKey,
  getLegacyCouponReservationState,
  MAX_LEGACY_CUSTOMER_ORDERS_FOR_BOOTSTRAP,
} from '@/lib/coupons/user-usage';
import {
  validateShippingAddress,
  validatePurchasableProduct,
  calculateAuthoritativePricing,
  calculateStockUpdates,
  validateFirestoreCoupon,
  type FirestoreCouponRule,
} from '@/lib/orders/checkout-validation';

const CHECKOUT_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSO-${timestamp}-${randomChars}`;
}

export async function POST(req: NextRequest) {
  try {
    const authenticatedUser = await requireServerUser(req);
    if (!authenticatedUser) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const {
      customerDetails,
      shippingAddress,
      items,
      checkoutRequestId,
      paymentMethod = 'razorpay',
      couponCode,
    } = body;
    const customerId = authenticatedUser.uid;

    if (typeof checkoutRequestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(checkoutRequestId)) {
      return NextResponse.json({ error: 'Valid checkout request ID is required' }, { status: 400 });
    }
    const checkoutRequestRef = adminDb.collection('checkoutRequests').doc(`${customerId}_${checkoutRequestId}`);
    const activeAttemptRef = getActivePaymentAttemptRef(customerId);
    const checkoutCoordinationRef = getCheckoutCoordinationRef(customerId);
    if (checkoutRequestRef.path === activeAttemptRef.path) {
      return NextResponse.json({ error: 'Invalid checkout request ID' }, { status: 400 });
    }

    const priorRequest = await checkoutRequestRef.get();
    if (priorRequest.exists) {
      const prior = priorRequest.data()!;
      const priorOrderRef = adminDb.collection('orders').doc(prior.orderId);
      const priorOrderSnap = await priorOrderRef.get();
      const priorOrder = priorOrderSnap.data();
      if (priorOrder?.payment?.method === 'razorpay' &&
          (priorOrder.payment.status === 'pending' || priorOrder.payment.status === 'authorized')) {
        const lockResult = await adminDb.runTransaction(async (transaction) => {
          const [lockSnap, orderSnap] = await Promise.all([
            transaction.get(activeAttemptRef),
            transaction.get(priorOrderRef),
          ]);
          const current = orderSnap.data();
          if (lockSnap.exists && lockSnap.data()?.orderId !== prior.orderId) return false;
          if (!lockSnap.exists && current?.customerId === customerId &&
              (current.payment?.status === 'pending' || current.payment?.status === 'authorized')) {
            transaction.set(activeAttemptRef, {
              userId: customerId,
              orderId: prior.orderId,
              orderNumber: prior.orderNumber,
              createdAt: current.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          return true;
        });
        if (!lockResult) {
          return NextResponse.json({ error: 'Another payment attempt needs a status check.' }, { status: 409 });
        }
      }
      return NextResponse.json({
        success: true,
        orderId: prior.orderId,
        orderNumber: prior.orderNumber,
        totalAmount: prior.totalAmount,
        currency: 'INR',
        paymentMethod: prior.paymentMethod,
        paymentStatus: priorOrder?.payment?.status || prior.paymentStatus,
      });
    }

    // Heal unresolved orders created before the active-attempt lock was introduced.
    const existingOrders = await adminDb.collection('orders').where('customerId', '==', customerId).get();
    const legacyUnresolved = existingOrders.docs.find((doc) => {
      const existing = doc.data();
      return existing.payment?.method === 'razorpay' &&
        (existing.payment?.status === 'pending' || existing.payment?.status === 'authorized' ||
          (Boolean(existing.payment?.failureFinalizedAt) && existing.payment?.status !== 'captured'));
    });
    if (legacyUnresolved) {
      const order = legacyUnresolved.data();
      await adminDb.runTransaction(async (transaction) => {
        const [lockSnap, orderSnap] = await Promise.all([
          transaction.get(activeAttemptRef),
          transaction.get(legacyUnresolved.ref),
        ]);
        const current = orderSnap.data();
        if (!lockSnap.exists && current?.customerId === customerId &&
            (current.payment?.status === 'pending' || current.payment?.status === 'authorized' ||
              (Boolean(current.payment?.failureFinalizedAt) && current.payment?.status !== 'captured'))) {
          transaction.set(activeAttemptRef, {
            userId: customerId,
            orderId: legacyUnresolved.id,
            orderNumber: current.orderNumber,
            createdAt: current.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
      return NextResponse.json({
        error: 'An earlier online payment needs a status check before starting another checkout.',
        activeOrderId: legacyUnresolved.id,
        activeOrderNumber: order.orderNumber,
      }, { status: 409 });
    }

    const activeAttemptSnap = await activeAttemptRef.get();
    if (activeAttemptSnap.exists) {
      const activeOrderId = activeAttemptSnap.data()?.orderId;
      const activeOrderSnap = typeof activeOrderId === 'string'
        ? await adminDb.collection('orders').doc(activeOrderId).get()
        : null;
      const activeOrder = activeOrderSnap?.data();
      if (activeOrder?.customerId === customerId && activeOrder.payment?.status === 'captured') {
        return NextResponse.json({
          success: true,
          orderId: activeOrderId,
          orderNumber: activeOrder.orderNumber,
          totalAmount: activeOrder.pricing?.totalAmount,
          currency: 'INR',
          paymentMethod: 'razorpay',
          paymentStatus: 'captured',
        });
      }
      return NextResponse.json({
        error: 'An earlier online payment needs a status check before starting another checkout.',
        activeOrderId: activeOrderId || null,
        activeOrderNumber: activeOrder?.orderNumber || null,
      }, { status: 409 });
    }

    if (!['razorpay', 'cod'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 });
    }

    // 1. Basic validation
    if (!customerId || !customerDetails?.email || !customerDetails?.name) {
      return NextResponse.json(
        { error: 'Customer information is required' },
        { status: 400 }
      );
    }

    const addressValidation = validateShippingAddress(shippingAddress);
    if (!addressValidation.isValid || !addressValidation.cleanAddress) {
      return NextResponse.json(
        { error: addressValidation.error || 'Valid shipping address is required' },
        { status: 400 }
      );
    }
    const cleanShippingAddress = addressValidation.cleanAddress;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Cannot create order with an empty cart' },
        { status: 400 }
      );
    }

    // 2. Fetch fresh product details to ensure authentic price, variant integrity & stock availability
    const verifiedOrderItems: OrderItem[] = [];
    const sellerIdsSet = new Set<string>();
    const seenItemKeys = new Set<string>();

    for (const item of items) {
      if (!item?.productId || typeof item.productId !== 'string') {
        return NextResponse.json({ error: 'Valid product ID is required for each cart item.' }, { status: 400 });
      }

      const cleanVariantSku = typeof item.variantSku === 'string' ? item.variantSku.trim() : '';
      const itemKey = cleanVariantSku ? `${item.productId}:${cleanVariantSku}` : item.productId;
      if (seenItemKeys.has(itemKey)) {
        return NextResponse.json({ error: 'Each product variant must appear once in the cart.' }, { status: 400 });
      }
      seenItemKeys.add(itemKey);

      const productRef = adminDb.collection('products').doc(item.productId);
      const productSnap = await productRef.get();

      const validationRes = validatePurchasableProduct(productSnap.data(), item);
      if (!validationRes.isValid || !validationRes.verifiedItem) {
        return NextResponse.json(
          { error: validationRes.error || 'Product validation failed.' },
          { status: 400 }
        );
      }

      const verified = validationRes.verifiedItem;
      sellerIdsSet.add(verified.sellerId);
      verifiedOrderItems.push(verified);
    }
    let subtotal: number;
    try {
      subtotal = calculateItemsSubtotal(verifiedOrderItems);
    } catch {
      return NextResponse.json({ error: 'The order total exceeds the supported currency precision.' }, { status: 400 });
    }

    // 3. Resolve the unique normalized Firestore definition. Its authoritative
    // terms and usage counter are re-read and validated in the order transaction.
    let couponRef: FirebaseFirestore.DocumentReference | null = null;
    if (couponCode !== undefined && couponCode !== null && typeof couponCode !== 'string') {
      return NextResponse.json({ error: 'Invalid coupon code.' }, { status: 400 });
    }
    const cleanCouponCode = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : '';
    if (cleanCouponCode) {
      const codeReservationId = createHash('sha256').update(cleanCouponCode).digest('hex');
      const codeReservation = await adminDb.collection('couponCodes').doc(codeReservationId).get();
      if (codeReservation.exists) {
        const reservedCouponId = codeReservation.data()?.couponId;
        if (typeof reservedCouponId !== 'string' || !reservedCouponId) {
          return NextResponse.json({ error: 'Coupon code is unavailable.' }, { status: 409 });
        }
        couponRef = adminDb.collection('coupons').doc(reservedCouponId);
      } else {
        // Compatibility path for existing coupons created before the permanent
        // code registry. Fail closed if normalized legacy records are ambiguous.
        const allCoupons = await adminDb.collection('coupons').get();
        const matchingCoupons = allCoupons.docs.filter((snapshot) => {
          const storedCode = snapshot.data().code;
          return typeof storedCode === 'string' && storedCode.trim().toUpperCase() === cleanCouponCode;
        });
        if (matchingCoupons.length === 0) {
          return NextResponse.json({ error: 'Invalid or expired coupon code.' }, { status: 400 });
        }
        if (matchingCoupons.length > 1) {
          return NextResponse.json({ error: 'Coupon code is ambiguous. Please contact support.' }, { status: 409 });
        }
        couponRef = adminDb.collection('coupons').doc(matchingCoupons[0].id);
      }
    }

    // 4. Determine initial statuses based on payment method
    const isCod = paymentMethod === 'cod';
    const orderStatus: OrderStatus = isCod ? 'confirmed' : 'pending';
    const paymentStatus: PaymentStatus = 'pending';

    const orderNumber = generateOrderNumber();
    const now = new Date().toISOString();

    const payment: OrderPayment = {
      method: paymentMethod as PaymentMethod,
      status: paymentStatus,
    };

    const initialTimeline = [
      {
        status: isCod ? 'confirmed' : 'pending',
        timestamp: now,
        note: isCod
          ? 'Order placed with Cash on Delivery payment option.'
          : 'Order placed, awaiting digital payment completion.',
        updatedBy: customerId,
      },
    ];

    const orderDocRef = adminDb.collection('orders').doc();
    const checkoutFingerprint = createHash('sha256').update(JSON.stringify({
      items: verifiedOrderItems.map((item) => [item.productId, item.variantSku || '', item.quantity]),
      address: {
        addressLine1: cleanShippingAddress.addressLine1,
        addressLine2: cleanShippingAddress.addressLine2 || '',
        city: cleanShippingAddress.city,
        state: cleanShippingAddress.state,
        postalCode: cleanShippingAddress.postalCode,
        country: cleanShippingAddress.country,
        phoneNumber: cleanShippingAddress.phoneNumber || '',
      },
      couponCode: cleanCouponCode,
    })).digest('hex');

    // 5. Batch write: save order, atomically verify and deduct stock, and empty user's cart
    const cartRef = adminDb.collection('carts').doc(customerId);
    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      const [existingRequest, activeAttempt, checkoutCoordination] = await Promise.all([
        transaction.get(checkoutRequestRef),
        transaction.get(activeAttemptRef),
        transaction.get(checkoutCoordinationRef),
      ]);
      if (existingRequest.exists) {
        const prior = existingRequest.data() as {
          orderId: string; orderNumber: string; totalAmount: number; paymentMethod: string; paymentStatus: string;
        };
        const priorOrderRef = adminDb.collection('orders').doc(prior.orderId);
        const priorOrderSnap = await transaction.get(priorOrderRef);
        const priorOrder = priorOrderSnap.data();
        if (priorOrder?.payment?.method === 'razorpay' &&
            (priorOrder.payment.status === 'pending' || priorOrder.payment.status === 'authorized')) {
          if (activeAttempt.exists && activeAttempt.data()?.orderId !== prior.orderId) {
            return { blocked: true, orderId: activeAttempt.data()?.orderId as string | undefined };
          }
          if (!activeAttempt.exists) {
            transaction.set(activeAttemptRef, {
              userId: customerId,
              orderId: prior.orderId,
              orderNumber: prior.orderNumber,
              createdAt: priorOrder.createdAt || now,
              updatedAt: now,
            });
          }
        }
        return { duplicate: true, ...prior };
      }
      const coordinated = checkoutCoordination.data();
      if (coordinated?.fingerprint === checkoutFingerprint &&
          isCheckoutCoordinationFresh(coordinated.createdAt, Date.now(), CHECKOUT_DEDUPE_WINDOW_MS) &&
          typeof coordinated.orderId === 'string') {
        const coordinatedOrderRef = adminDb.collection('orders').doc(coordinated.orderId);
        const coordinatedOrderSnap = await transaction.get(coordinatedOrderRef);
        const coordinatedOrder = coordinatedOrderSnap.data();
        if (coordinatedOrderSnap.exists && coordinatedOrder?.customerId === customerId) {
          if (coordinatedOrder.payment?.method !== paymentMethod) {
            return {
              blocked: true,
              orderId: coordinatedOrderRef.id,
              paymentMethod: coordinatedOrder.payment?.method,
            };
          }
          return {
            duplicate: true,
            orderId: coordinatedOrderRef.id,
            orderNumber: coordinatedOrder.orderNumber,
            totalAmount: coordinatedOrder.pricing?.totalAmount,
            paymentMethod: coordinatedOrder.payment?.method,
            paymentStatus: coordinatedOrder.payment?.status,
          };
        }
        return { blocked: true, orderId: coordinated.orderId as string };
      }
      if (activeAttempt.exists) {
        const activeOrderId = activeAttempt.data()?.orderId;
        const activeOrderRef = typeof activeOrderId === 'string'
          ? adminDb.collection('orders').doc(activeOrderId)
          : null;
        const activeOrderSnap = activeOrderRef ? await transaction.get(activeOrderRef) : null;
        const activeOrder = activeOrderSnap?.data();
        return activeOrder?.payment?.status === 'captured'
          ? { paid: true, orderId: activeOrderId as string, orderNumber: activeOrder.orderNumber, totalAmount: activeOrder.pricing?.totalAmount }
          : { blocked: true, orderId: typeof activeOrderId === 'string' ? activeOrderId : undefined };
      }

      // Group items by productId so multiple items for the same product (e.g. variants) are verified & updated safely
      const itemsByProductId = new Map<string, Array<{ variantSku?: string; quantity: number }>>();
      for (const item of verifiedOrderItems) {
        const list = itemsByProductId.get(item.productId) || [];
        list.push({ variantSku: item.variantSku, quantity: item.quantity });
        itemsByProductId.set(item.productId, list);
      }

      const uniqueProductIds = Array.from(itemsByProductId.keys());
      const productRefs = uniqueProductIds.map((id) => adminDb.collection('products').doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
      const couponSnap = couponRef ? await transaction.get(couponRef) : null;

      const pendingStockUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; payload: Record<string, unknown> }> = [];

      for (let index = 0; index < uniqueProductIds.length; index++) {
        const pId = uniqueProductIds[index];
        const snap = productSnaps[index];
        const reqItems = itemsByProductId.get(pId)!;

        if (!snap.exists) {
          return { failed: true, error: 'A product in your cart is no longer available in the catalogue.', status: 400 };
        }

        const productData = snap.data();
        const stockResult = calculateStockUpdates(productData, reqItems);
        if (!stockResult.isValid || !stockResult.updatePayload) {
          return { failed: true, error: stockResult.error || 'Insufficient stock for one or more items.', status: 400 };
        }

        pendingStockUpdates.push({ ref: productRefs[index], payload: stockResult.updatePayload });
      }

      let currentCouponRule: FirestoreCouponRule | null = null;
      if (couponRef) {
        if (!couponSnap?.exists) {
          return { failed: true, error: 'Coupon is no longer available.', status: 400 };
        }
        const couponValidation = validateFirestoreCoupon(couponSnap.data());
        if (!couponValidation.isValid || !couponValidation.couponRule) {
          return { failed: true, error: couponValidation.error || 'Coupon is invalid.', status: 400 };
        }
        if (couponValidation.couponRule.code !== cleanCouponCode) {
          return { failed: true, error: 'Coupon definition does not match the requested code.', status: 400 };
        }
        currentCouponRule = couponValidation.couponRule;
      }

      const { pricing, appliedCoupon } = calculateAuthoritativePricing(subtotal, currentCouponRule);
      const totalAmount = pricing.totalAmount;
      let couponUsageRef: FirebaseFirestore.DocumentReference | null = null;
      let couponReservationRef: FirebaseFirestore.DocumentReference | null = null;
      let couponUsageState: Record<string, unknown> | null = null;
      let couponReservationState: Record<string, unknown> | null = null;
      let legacyReservationWrites: Array<{ ref: FirebaseFirestore.DocumentReference; state: string }> = [];
      let legacyUsageCount = 0;
      let legacyOrderCount = 0;

      if (couponRef && currentCouponRule && appliedCoupon) {
        const usageKey = getCouponUserUsageKey(couponRef.id, customerId);
        couponUsageRef = adminDb.collection('couponUserUsage').doc(usageKey);
        couponReservationRef = couponUsageRef.collection('reservations').doc(orderDocRef.id);
        const [usageSnap, reservationSnap] = await Promise.all([
          transaction.get(couponUsageRef),
          transaction.get(couponReservationRef),
        ]);
        couponUsageState = usageSnap.exists ? usageSnap.data() as Record<string, unknown> : null;
        couponReservationState = reservationSnap.exists ? reservationSnap.data() as Record<string, unknown> : null;

        if (couponUsageState && (couponUsageState.state !== 'ready' ||
            couponUsageState.couponId !== couponRef.id || couponUsageState.customerId !== customerId ||
            !Number.isSafeInteger(couponUsageState.occupiedCount) || (couponUsageState.occupiedCount as number) < 0)) {
          return { blocked: true, reason: 'coupon-usage-ledger-unavailable' };
        }
        if (couponReservationState) {
          return { blocked: true, reason: 'coupon-order-reservation-already-exists' };
        }

        if (!couponUsageState) {
          // A limit+1 query is complete for customer histories at or below the
          // bound and proves overflow without an unbounded transactional scan.
          const legacyOrders = await transaction.get(
            adminDb.collection('orders')
              .where('customerId', '==', customerId)
              .limit(MAX_LEGACY_CUSTOMER_ORDERS_FOR_BOOTSTRAP + 1)
          );
          if (legacyOrders.docs.length > MAX_LEGACY_CUSTOMER_ORDERS_FOR_BOOTSTRAP) {
            transaction.set(couponUsageRef, {
              state: 'blocked',
              couponId: couponRef.id,
              customerId,
              reason: 'legacy-history-exceeds-bootstrap-bound',
              updatedAt: now,
            });
            return { blocked: true, reason: 'coupon-usage-history-requires-reconciliation' };
          }
          legacyOrderCount = legacyOrders.docs.length;

          const legacyStates = legacyOrders.docs.map((legacyOrder) => ({
            id: legacyOrder.id,
            state: getLegacyCouponReservationState(
              legacyOrder.data(), couponRef!.id, currentCouponRule!.code
            ),
          }));
          if (legacyStates.some(({ state }) => state === 'ambiguous')) {
            transaction.set(couponUsageRef, {
              state: 'blocked',
              couponId: couponRef.id,
              customerId,
              reason: 'ambiguous-legacy-coupon-history',
              updatedAt: now,
            });
            return { blocked: true, reason: 'coupon-usage-history-requires-reconciliation' };
          }

          legacyUsageCount = legacyStates.filter(({ state }) => state && state !== 'released').length;
          legacyReservationWrites = legacyStates
            .filter(({ state }) => state && state !== 'released')
            .map(({ id, state }) => ({
              ref: couponUsageRef!.collection('reservations').doc(id),
              state: state!,
            }));
        } else {
          legacyUsageCount = couponUsageState.occupiedCount as number;
        }

        if (legacyUsageCount >= currentCouponRule.perUserLimit) {
          if (!couponUsageState) {
            transaction.set(couponUsageRef, {
              state: 'ready', couponId: couponRef.id, customerId,
              occupiedCount: legacyUsageCount, legacyOrderCount,
              initializedAt: now, updatedAt: now,
            });
            for (const legacy of legacyReservationWrites) {
              transaction.set(legacy.ref, {
                orderId: legacy.ref.id, couponId: couponRef.id, customerId,
                state: legacy.state, source: 'legacy-bootstrap', createdAt: now, updatedAt: now,
              });
            }
          }
          return { failed: true, error: 'This coupon has reached its per-customer usage limit.', status: 409 };
        }
      }
      const orderRecord: Omit<Order, 'id'> = {
        orderNumber,
        customerId,
        customerDetails: {
          name: customerDetails.name,
          email: customerDetails.email,
          phone: customerDetails.phone || cleanShippingAddress.phoneNumber,
        },
        shippingAddress: cleanShippingAddress,
        items: verifiedOrderItems,
        sellerIds: Array.from(sellerIdsSet),
        pricing,
        ...(appliedCoupon && couponRef && currentCouponRule ? {
          couponApplied: {
            couponId: couponRef.id,
            code: currentCouponRule.code,
            termsSnapshot: {
              version: 1 as const,
              discountType: currentCouponRule.discountType,
              discountValue: currentCouponRule.discountValue,
              minOrderValue: currentCouponRule.minOrderValue,
              ...(currentCouponRule.maxDiscountAmount !== undefined
                ? { maxDiscountAmount: currentCouponRule.maxDiscountAmount }
                : {}),
              validFrom: currentCouponRule.validFrom,
              validUntil: currentCouponRule.validUntil,
              usageLimit: currentCouponRule.usageLimit,
              perUserLimit: currentCouponRule.perUserLimit,
            },
            discountAmount: appliedCoupon.discountValue,
            // Keep the former applied-discount field for readers of the old order shape.
            discountValue: appliedCoupon.discountValue,
          },
        } : {}),
        payment,
        orderStatus,
        statusTimeline: initialTimeline,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(orderDocRef, orderRecord);
      if (!isCod) {
        transaction.set(activeAttemptRef, {
          userId: customerId,
          orderId: orderDocRef.id,
          orderNumber,
          createdAt: now,
          updatedAt: now,
        });
      }
      transaction.set(checkoutRequestRef, {
        orderId: orderDocRef.id,
        orderNumber,
        totalAmount,
        paymentMethod,
        paymentStatus: paymentStatus,
        createdAt: now,
      });
      transaction.set(checkoutCoordinationRef, {
        userId: customerId,
        orderId: orderDocRef.id,
        fingerprint: checkoutFingerprint,
        paymentMethod,
        createdAt: now,
      });

      if (couponRef && appliedCoupon) {
        transaction.update(couponRef, {
          usageCount: (currentCouponRule?.usageCount ?? 0) + 1,
          updatedAt: now,
        });
        const usageKey = getCouponUserUsageKey(couponRef.id, customerId);
        const usageRef = couponUsageRef || adminDb.collection('couponUserUsage').doc(usageKey);
        const usagePayload = {
          state: 'ready',
          couponId: couponRef.id,
          customerId,
          occupiedCount: legacyUsageCount + 1,
          legacyOrderCount: couponUsageState ? couponUsageState.legacyOrderCount ?? 0 : legacyOrderCount,
          updatedAt: now,
        };
        if (couponUsageState) transaction.update(usageRef, usagePayload);
        else transaction.set(usageRef, { ...usagePayload, initializedAt: now });
        const reservationRef = couponReservationRef || usageRef.collection('reservations').doc(orderDocRef.id);
        transaction.set(reservationRef, {
          orderId: orderDocRef.id,
          couponId: couponRef.id,
          customerId,
          paymentMethod: isCod ? 'cod' : 'razorpay',
          state: isCod ? 'awaiting_delivery' : 'reserved',
          createdAt: now,
          updatedAt: now,
        });
        for (const legacy of legacyReservationWrites) {
          transaction.set(legacy.ref, {
            orderId: legacy.ref.id,
            couponId: couponRef.id,
            customerId,
            state: legacy.state,
            source: 'legacy-bootstrap',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      for (const update of pendingStockUpdates) {
        transaction.update(update.ref, update.payload);
      }

      transaction.set(cartRef, { userId: customerId, items: [], updatedAt: now });
      return { duplicate: false, orderId: orderDocRef.id, orderNumber, totalAmount, paymentMethod, paymentStatus };
    });

    if ('failed' in transactionResult && transactionResult.failed) {
      return NextResponse.json(
        { error: transactionResult.error || 'Checkout validation failed' },
        { status: transactionResult.status || 400 }
      );
    }
      if ('blocked' in transactionResult && transactionResult.blocked) {
        if (transactionResult.reason === 'coupon-usage-history-requires-reconciliation') {
          return NextResponse.json({ error: 'Coupon usage history requires reconciliation before this coupon can be used.' }, { status: 503 });
        }
        if (transactionResult.reason === 'coupon-usage-ledger-unavailable' ||
            transactionResult.reason === 'coupon-order-reservation-already-exists') {
          return NextResponse.json({ error: 'Coupon usage could not be verified. Please retry or contact support.' }, { status: 503 });
        }
      return NextResponse.json({
        error: transactionResult.paymentMethod === 'cod'
          ? 'This checkout was already submitted with Cash on Delivery. Review that order before trying another payment method.'
          : 'An earlier online payment needs a status check before starting another checkout.',
        activeOrderId: transactionResult.orderId || null,
      }, { status: 409 });
    }
    if ('paid' in transactionResult && transactionResult.paid) {
      return NextResponse.json({
        success: true,
        orderId: transactionResult.orderId,
        orderNumber: transactionResult.orderNumber,
        totalAmount: transactionResult.totalAmount,
        currency: 'INR',
        paymentMethod: 'razorpay',
        paymentStatus: 'captured',
      });
    }

    if (transactionResult.duplicate) {
      const existingOrder = await adminDb.collection('orders').doc(transactionResult.orderId).get();
      return NextResponse.json({
        success: true,
        orderId: transactionResult.orderId,
        orderNumber: transactionResult.orderNumber,
        totalAmount: transactionResult.totalAmount,
        currency: 'INR',
        paymentMethod: transactionResult.paymentMethod,
        paymentStatus: existingOrder.data()?.payment?.status || transactionResult.paymentStatus,
      });
    }

    // 6. Create in-app notifications for customer and sellers
    try {
      await adminDb.collection('notifications').add({
        userId: customerId,
        title: `Order Confirmed: #${orderNumber}`,
        message: `Your artisanal order #${orderNumber} for ₹${transactionResult.totalAmount.toLocaleString('en-IN')} has been placed successfully.`,
        type: 'order',
        link: `/account/orders/${orderDocRef.id}`,
        read: false,
        createdAt: now,
      });

      for (const sId of Array.from(sellerIdsSet)) {
        await adminDb.collection('notifications').add({
          userId: sId,
          title: 'New Order Received',
          message: `Order #${orderNumber} has been placed with items from your catalog.`,
          type: 'order',
          link: `/seller/orders/${orderDocRef.id}`,
          read: false,
          createdAt: now,
        });
      }
    } catch (notifErr) {
      console.warn('Failed dispatching order notifications:', notifErr);
    }

    return NextResponse.json({
      success: true,
      orderId: orderDocRef.id,
      orderNumber,
      totalAmount: transactionResult.totalAmount,
      currency: 'INR',
      paymentMethod,
      paymentStatus,
    });
  } catch (error: unknown) {
    console.error('Order creation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to place order';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
