import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ReviewStars } from './ReviewStars';
import { formatDate } from '@/lib/utils';
import type { Review } from '@/types';

interface ReviewCardProps {
  review: Review;
}

/**
 * Displays a single customer review card with rating, headline, body,
 * verified-purchase badge, and optional seller response.
 */
export function ReviewCard({ review }: ReviewCardProps) {
  const initials = (review.userName || 'C')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <article className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3 shadow-xs">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs uppercase shrink-0 overflow-hidden">
            {review.userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={review.userAvatar}
                alt={review.userName}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {/* Name + date */}
          <div>
            <p className="text-xs font-semibold text-zinc-900">{review.userName}</p>
            <p className="text-[11px] text-zinc-400">{formatDate(review.createdAt)}</p>
          </div>
        </div>

        {/* Stars */}
        <ReviewStars rating={review.rating} size="w-3.5 h-3.5" />
      </div>

      {/* Verified badge */}
      {review.isVerifiedPurchase && (
        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <ShieldCheck className="w-3 h-3" />
          Verified Purchase
        </div>
      )}

      {/* Headline */}
      <h4 className="text-xs font-bold text-zinc-900">{review.title}</h4>

      {/* Body */}
      <p className="text-xs text-zinc-600 leading-relaxed">{review.comment}</p>

      {/* Review images */}
      {review.images && review.images.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-1">
          {review.images.slice(0, 4).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`Review image ${i + 1}`}
              className="w-14 h-14 rounded-md object-cover border border-zinc-200"
            />
          ))}
        </div>
      )}

      {/* Seller response */}
      {review.sellerResponse && (
        <div className="mt-2 pl-3 border-l-2 border-amber-300 bg-amber-50/50 rounded-r-lg p-3">
          <p className="text-[11px] font-semibold text-amber-800 mb-0.5">Seller Response</p>
          <p className="text-xs text-zinc-600 leading-relaxed">{review.sellerResponse.comment}</p>
          <p className="text-[10px] text-zinc-400 mt-1">{formatDate(review.sellerResponse.respondedAt)}</p>
        </div>
      )}
    </article>
  );
}
