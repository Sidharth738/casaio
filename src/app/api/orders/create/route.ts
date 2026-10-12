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
  UserAddress,
} from '@/types';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef, isCheckoutCoordinationFresh } from '@/lib/payment/attempts';

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

    if (!shippingAddress || !shippingAddress.addressLine1 || !shippingAddress.postalCode) {
      return NextResponse.json(
        { error: 'Valid shipping address is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Cannot create order with an empty cart' },
        { status: 400 }
      );
    }

    // 2. Fetch fresh product details to ensure authentic price & stock availability
    let subtotal = 0;
    const verifiedOrderItems: OrderItem[] = [];
    const sellerIdsSet = new Set<string>();
    const seenProductIds = new Set<string>();

    for (const item of items) {
      if (!item?.productId || seenProductIds.has(item.productId)) {
        return NextResponse.json({ error: 'Each product must appear once in the cart.' }, { status: 400 });
      }
      seenProductIds.add(item.productId);
      const productRef = adminDb.collection('products').doc(item.productId);
      const productSnap = await productRef.get();

      if (!productSnap.exists) {
        return NextResponse.json(
          { error: `Product "${item.title}" is no longer available in the catalogue.` },
          { status: 400 }
        );
      }

      const product = productSnap.data();

      if ((product?.stock ?? 0) < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for "${product?.title}". Available: ${product?.stock ?? 0}, Requested: ${item.quantity}.`,
          },
          { status: 400 }
        );
      }

      const unitPrice = Number(product?.price);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return NextResponse.json({ error: 'Invalid product quantity or price' }, { status: 400 });
      }
      const itemTotal = unitPrice * quantity;
      subtotal += itemTotal;

      const sellerId = product?.sellerId || item.sellerId || 'casaio-direct';
      sellerIdsSet.add(sellerId);

      verifiedOrderItems.push({
        productId: item.productId,
        ...(typeof item.variantSku === 'string' && item.variantSku
          ? { variantSku: item.variantSku }
          : {}),
        title: product?.title || item.title,
        slug: product?.slug || item.slug,
        imageUrl:
          product?.images?.find((image: { isPrimary?: boolean }) => image.isPrimary)?.url ||
          product?.images?.[0]?.url ||
          (typeof item.imageUrl === 'string' ? item.imageUrl : ''),
        unitPrice,
        quantity,
        totalPrice: itemTotal,
        sellerId,
        sellerStoreName: product?.sellerStoreName || item.sellerStoreName || 'Casaio Artisans',
        fulfillmentStatus: 'pending',
      });
    }

    // 3. Validate coupon if provided
    let discountAmount = 0;
    let appliedCoupon: { code: string; discountValue: number } | undefined = undefined;

    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      if (cleanCode === 'CASAIO10') {
        discountAmount = Math.round(subtotal * 0.1);
        appliedCoupon = { code: 'CASAIO10', discountValue: discountAmount };
      } else if (cleanCode === 'WELCOME500' && subtotal >= 2999) {
        discountAmount = 500;
        appliedCoupon = { code: 'WELCOME500', discountValue: 500 };
      } else {
        const couponSnap = await adminDb
          .collection('coupons')
          .where('code', '==', cleanCode)
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (!couponSnap.empty) {
          const couponData = couponSnap.docs[0].data();
          if (!couponData.minOrderValue || subtotal >= couponData.minOrderValue) {
            if (couponData.discountType === 'percentage') {
              discountAmount = Math.round((subtotal * couponData.discountValue) / 100);
              if (couponData.maxDiscountAmount && discountAmount > couponData.maxDiscountAmount) {
                discountAmount = couponData.maxDiscountAmount;
              }
            } else {
              discountAmount = Math.min(couponData.discountValue, subtotal);
            }
            appliedCoupon = { code: cleanCode, discountValue: discountAmount };
          }
        }
      }
    }

    const shippingFee = 0; // Complimentary white-glove courier shipping
    const taxAmount = Math.round((subtotal - discountAmount) * 0.18);
    // Catalog prices include GST; taxAmount is a displayed breakdown only.
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

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
        addressLine1: shippingAddress.addressLine1,
        addressLine2: shippingAddress.addressLine2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
        phoneNumber: shippingAddress.phoneNumber || '',
      },
      couponCode: appliedCoupon?.code || '',
    })).digest('hex');

    const orderRecord: Omit<Order, 'id'> = {
      orderNumber,
      customerId,
      customerDetails: {
        name: customerDetails.name,
        email: customerDetails.email,
        phone: customerDetails.phone || shippingAddress.phoneNumber,
      },
      shippingAddress: shippingAddress as UserAddress,
      items: verifiedOrderItems,
      sellerIds: Array.from(sellerIdsSet),
      pricing: {
        subtotal,
        discountAmount,
        shippingFee,
        taxAmount,
        totalAmount,
      },
      ...(appliedCoupon ? { couponApplied: appliedCoupon } : {}),
      payment,
      orderStatus,
      statusTimeline: initialTimeline,
      createdAt: now,
      updatedAt: now,
    };

    // 5. Batch write: save order, deduct stock, and empty user's cart
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
      const productRefs = verifiedOrderItems.map((item) => adminDb.collection('products').doc(item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
      for (let index = 0; index < verifiedOrderItems.length; index++) {
        const item = verifiedOrderItems[index];
        const snap = productSnaps[index];
        const stock = Number(snap.data()?.stock || 0);
        if (!snap.exists || stock < item.quantity) {
          throw new Error(`Insufficient stock for "${item.title}".`);
        }
      }
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
      for (let index = 0; index < verifiedOrderItems.length; index++) {
        const item = verifiedOrderItems[index];
        const productData = productSnaps[index].data();
        transaction.update(productRefs[index], {
          stock: Number(productData?.stock || 0) - item.quantity,
          salesCount: Number(productData?.salesCount || 0) + item.quantity,
          updatedAt: now,
        });
      }
      transaction.set(cartRef, { userId: customerId, items: [], updatedAt: now });
      return { duplicate: false, orderId: orderDocRef.id, orderNumber, totalAmount, paymentMethod, paymentStatus };
    });

    if ('blocked' in transactionResult && transactionResult.blocked) {
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
        message: `Your artisanal order #${orderNumber} for ₹${totalAmount.toLocaleString('en-IN')} has been placed successfully.`,
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
      totalAmount,
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
