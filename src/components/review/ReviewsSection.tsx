'use client';

import React, { useEffect, useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { ReviewCard } from './ReviewCard';
import { ReviewForm } from './ReviewForm';
import { ReviewStars } from './ReviewStars';
import { getProductReviews } from '@/lib/firebase/firestore';
import type { Review } from '@/types';

interface ReviewsSectionProps {
  productId: string;
  initialRating?: number;
  initialCount?: number;
}

/**
 * Full reviews section: aggregate rating bar, live review list from Firestore,
 * and a write-a-review form for authenticated users.
 */
export function ReviewsSection({ productId, initialRating = 5, initialCount = 0 }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isFetched, setIsFetched] = useState(false);

  useEffect(() => {
    let mounted = true;
    getProductReviews(productId)
      .then((data) => { if (mounted) setReviews(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setIsFetched(true); });
    return () => { mounted = false; };
  }, [productId]);

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : initialRating;

  const reviewCount = reviews.length || initialCount;

  // Compute distribution breakdown
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct: reviews.length > 0
      ? Math.round((reviews.filter((r) => r.rating === star).length / reviews.length) * 100)
      : 0,
  }));

  const handleNewReview = (review: Review) => {
    setReviews((prev) => [review, ...prev]);
  };

  return (
    <section className="mt-16 sm:mt-20 pt-12 border-t border-zinc-200/80">
      {/* Section heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-widest">
            Customer Impressions
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950 mt-1">
            Verified Owner Reviews
          </h2>
        </div>

        {/* Aggregate rating summary */}
        <div className="flex items-center gap-3">
          <span className="font-serif text-4xl font-bold text-zinc-950">
            {avgRating.toFixed(1)}
          </span>
          <div>
            <ReviewStars rating={avgRating} size="w-4 h-4" />
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: rating breakdown + review form */}
        <div className="space-y-6">
          {/* Rating breakdown bars */}
          {isFetched && reviews.length > 0 && (
            <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-zinc-700 mb-3">Rating Breakdown</p>
              {breakdown.map(({ star, count, pct }) => (
                <div key={star} className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 w-16 shrink-0">
                    <span className="text-[11px] text-zinc-600 font-medium">{star}</span>
                    <Star className="w-3 h-3 fill-orange-500 text-orange-500" />
                  </div>
                  <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-zinc-400 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Write a review */}
          <ReviewForm productId={productId} onSuccess={handleNewReview} />
        </div>

        {/* Right column: reviews list */}
        <div className="lg:col-span-2 space-y-4">
          {!isFetched ? (
            <div className="grid grid-cols-1 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse h-32" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
              <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="font-serif text-base font-bold text-zinc-900">No reviews yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Be the first to share your experience with this product.
              </p>
            </div>
          ) : (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
