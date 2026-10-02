import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Review } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';

async function recalculateProductRating(productId: string) {
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

    await adminDb.collection('products').doc(productId).update({
      rating: avgRating,
      reviewCount: totalCount,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed recalculating product rating after review moderation:', err);
  }
}

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
    const snap = await reviewRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const reviewData = snap.data() as Review;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

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

    await reviewRef.update(updates);

    if (status && status !== reviewData.status) {
      await recalculateProductRating(reviewData.productId);
    }

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
    const snap = await reviewRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const reviewData = snap.data() as Review;
    await reviewRef.delete();

    await recalculateProductRating(reviewData.productId);

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
