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

function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSO-${timestamp}-${randomChars}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerId,
      customerDetails,
      shippingAddress,
      items,
      paymentMethod = 'razorpay',
      couponCode,
    } = body;

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

    for (const item of items) {
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

      const unitPrice = product?.price || item.unitPrice;
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      const sellerId = product?.sellerId || item.sellerId || 'casaio-direct';
      sellerIdsSet.add(sellerId);

      verifiedOrderItems.push({
        productId: item.productId,
        variantSku: item.variantSku,
        title: product?.title || item.title,
        slug: product?.slug || item.slug,
        imageUrl: (product?.images && product?.images[0]) || item.imageUrl || '',
        unitPrice,
        quantity: item.quantity,
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
      couponApplied: appliedCoupon,
      payment,
      orderStatus,
      statusTimeline: initialTimeline,
      createdAt: now,
      updatedAt: now,
    };

    // 5. Batch write: save order, deduct stock, and empty user's cart
    const batch = adminDb.batch();
    batch.set(orderDocRef, orderRecord);

    // Deduct stock
    for (const item of verifiedOrderItems) {
      const productRef = adminDb.collection('products').doc(item.productId);
      batch.update(productRef, {
        stock: (await productRef.get()).data()?.stock - item.quantity,
        salesCount: ((await productRef.get()).data()?.salesCount || 0) + item.quantity,
        updatedAt: now,
      });
    }

    // Clear user cart doc
    const cartRef = adminDb.collection('carts').doc(customerId);
    batch.set(cartRef, { userId: customerId, items: [], updatedAt: now });

    await batch.commit();

    return NextResponse.json({
      success: true,
      orderId: orderDocRef.id,
      orderNumber,
      totalAmount,
      currency: 'INR',
      paymentMethod,
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
