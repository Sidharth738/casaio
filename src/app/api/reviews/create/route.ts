import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Review } from '@/types';
import { requireServerUser } from '@/lib/firebase/server-auth';

export async function POST(req: NextRequest) {
  try {
    const authenticatedUser = await requireServerUser(req);
    if (!authenticatedUser) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const {
      productId,
      rating,
      title,
      comment,
      images = [],
    } = body;

    const userId = authenticatedUser.uid;
    const userSnap = await adminDb.collection('users').doc(userId).get();
    const userProfile = userSnap.data();
    const userName = userProfile?.displayName || authenticatedUser.email?.split('@')[0] || 'Customer';
    const userAvatar = userProfile?.photoURL || null;

    // 2. Validate input
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return NextResponse.json(
        { error: 'Rating must be an integer between 1 and 5' },
        { status: 400 }
      );
    }

    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      return NextResponse.json(
        { error: 'A review headline is required (min 2 characters)' },
        { status: 400 }
      );
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length < 5) {
      return NextResponse.json(
        { error: 'A review comment is required (min 5 characters)' },
        { status: 400 }
      );
    }

    // 3. Verify product exists
    const productRef = adminDb.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // 4. Check for Verified Purchase
    let isVerifiedPurchase = false;
    let verifiedOrderId: string | undefined = undefined;

    try {
      const ordersSnap = await adminDb
        .collection('orders')
        .where('customerId', '==', userId)
        .get();

      for (const orderDoc of ordersSnap.docs) {
        const orderData = orderDoc.data();
        const hasItem = Array.isArray(orderData.items) &&
          orderData.items.some((item: { productId: string }) => item.productId === productId);

        if (hasItem) {
          isVerifiedPurchase = true;
          verifiedOrderId = orderDoc.id;
          break;
        }
      }
    } catch (orderCheckErr) {
      console.warn('Error checking verified purchase:', orderCheckErr);
    }

    // 5. Create Review document
    const now = new Date().toISOString();
    const reviewData: Omit<Review, 'id'> = {
      productId,
      orderId: verifiedOrderId,
      userId,
      userName,
      userAvatar: userAvatar || undefined,
      rating: Math.round(numRating),
      title: title.trim(),
      comment: comment.trim(),
      images: Array.isArray(images) ? images : [],
      isVerifiedPurchase,
      status: 'published',
      createdAt: now,
    };

    const reviewRef = await adminDb.collection('reviews').add(reviewData);

    // 6. Recalculate Product's rating and review count
    try {
      const reviewsSnap = await adminDb
        .collection('reviews')
        .where('productId', '==', productId)
        .where('status', '==', 'published')
        .get();

      const allReviews = reviewsSnap.docs.map((d) => d.data() as Review);
      const totalCount = allReviews.length;
      const sumRating = allReviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0);
      const avgRating = totalCount > 0 ? Math.round((sumRating / totalCount) * 10) / 10 : 5;

      await productRef.update({
        rating: avgRating,
        reviewCount: totalCount,
        updatedAt: now,
      });
    } catch (calcErr) {
      console.warn('Failed to update product rating metrics:', calcErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        id: reviewRef.id,
        ...reviewData,
      },
    });
  } catch (error: unknown) {
    console.error('Submit review error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to submit review';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
