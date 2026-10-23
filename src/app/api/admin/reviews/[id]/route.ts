import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Review } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { calculatePublishedRatings } from '@/lib/reviews/aggregate';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await requireServerRole(req, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const { status, sellerResponseComment } = body as {
      status?: 'published' | 'hidden' | 'pending';
      sellerResponseComment?: string;
    };

    const reviewRef = adminDb.collection('reviews').doc(id);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (status) {
      if (!['published', 'hidden', 'pending'].includes(status)) {
        return NextResponse.json({ error: 'Invalid review status' }, { status: 400 });
      }
      updates.status = status;
    }

    if (sellerResponseComment !== undefined) {
      updates.sellerResponse = {
        comment: sellerResponseComment.trim(),
        respondedAt: now,
      };
    }

    const result = await adminDb.runTransaction(async (transaction) => {
      const reviewSnap = await transaction.get(reviewRef);
      if (!reviewSnap.exists) return 'missing' as const;
      const reviewData = reviewSnap.data() as Review;
      const productRef = adminDb.collection('products').doc(reviewData.productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) return 'missing_product' as const;

      const reviewsSnap = await transaction.get(
        adminDb.collection('reviews').where('productId', '==', reviewData.productId)
      );
      const updatedReview = { ...reviewData, ...updates } as Review;
      const allReviews = reviewsSnap.docs.map((doc) =>
        doc.id === id ? updatedReview : doc.data() as Review
      );

      transaction.update(reviewRef, updates);
      transaction.update(productRef, {
        ratings: calculatePublishedRatings(allReviews),
        updatedAt: now,
      });
      return 'updated' as const;
    });

    if (result === 'missing') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    if (result === 'missing_product') return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Review updated successfully',
    });
  } catch (error: unknown) {
    console.error('Admin review moderation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update review';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await requireServerRole(_req, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { id } = await params;
    const reviewRef = adminDb.collection('reviews').doc(id);
    const result = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(reviewRef);
      if (!snap.exists) return 'missing' as const;
      const reviewData = snap.data() as Review;
      const productRef = adminDb.collection('products').doc(reviewData.productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) return 'missing_product' as const;
      const reviewsSnap = await transaction.get(
        adminDb.collection('reviews').where('productId', '==', reviewData.productId)
      );
      const remainingReviews = reviewsSnap.docs
        .filter((doc) => doc.id !== id)
        .map((doc) => doc.data() as Review);
      transaction.delete(reviewRef);
      transaction.update(productRef, {
        ratings: calculatePublishedRatings(remainingReviews),
        updatedAt: new Date().toISOString(),
      });
      return 'deleted' as const;
    });

    if (result === 'missing') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    if (result === 'missing_product') return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Admin delete review error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete review';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
