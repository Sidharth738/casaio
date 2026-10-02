import { NextRequest, NextResponse } from 'next/server';
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
    const priorRequest = await checkoutRequestRef.get();
    if (priorRequest.exists) {
      const prior = priorRequest.data()!;
      const priorOrder = await adminDb.collection('orders').doc(prior.orderId).get();
      return NextResponse.json({
        success: true,
        orderId: prior.orderId,
        orderNumber: prior.orderNumber,
        totalAmount: prior.totalAmount,
        currency: 'INR',
        paymentMethod: prior.paymentMethod,
        paymentStatus: priorOrder.data()?.payment?.status || prior.paymentStatus,
      });
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
      const existingRequest = await transaction.get(checkoutRequestRef);
      if (existingRequest.exists) return { duplicate: true, ...(existingRequest.data() as {
        orderId: string; orderNumber: string; totalAmount: number; paymentMethod: string; paymentStatus: string;
      }) };
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
      transaction.set(checkoutRequestRef, {
        orderId: orderDocRef.id,
        orderNumber,
        totalAmount,
        paymentMethod,
        paymentStatus: paymentStatus,
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
