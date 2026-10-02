'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import type { Review } from '@/types';

interface ReviewFormProps {
  productId: string;
  onSuccess?: (review: Review) => void;
}

/**
 * Review submission form with interactive star picker, headline, and comment fields.
 * Calls POST /api/reviews/create and reports success/error inline.
 */
export function ReviewForm({ productId, onSuccess }: ReviewFormProps) {
  const { user, isAuthenticated } = useAuth();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayRating = hoverRating || rating;

  const ratingLabels: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rating === 0) {
      setError('Please select a star rating before submitting.');
      return;
    }
    if (!title.trim() || title.trim().length < 2) {
      setError('Please provide a review headline (at least 2 characters).');
      return;
    }
    if (!comment.trim() || comment.trim().length < 10) {
      setError('Please write a review comment (at least 10 characters).');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          rating,
          title: title.trim(),
          comment: comment.trim(),
          userId: user?.uid,
          userName: user?.displayName || 'Customer',
          userAvatar: user?.photoURL,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit review. Please try again.');
        return;
      }

      setSuccessMsg('Your review has been published! Thank you for sharing your experience.');
      setRating(0);
      setTitle('');
      setComment('');
      onSuccess?.(data.review as Review);
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-xs text-zinc-500">
        <p className="font-semibold text-zinc-700 mb-1">Sign in to leave a review</p>
        <p>Your experience helps other shoppers make informed decisions.</p>
        <a
          href="/login"
          className="inline-block mt-3 text-xs font-semibold text-orange-700 underline underline-offset-2"
        >
          Sign in to Casaio
        </a>
      </div>
    );
  }

  if (successMsg) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-xs font-semibold text-emerald-800 mb-1">Review Submitted</p>
        <p className="text-xs text-emerald-700">{successMsg}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
      <h3 className="font-serif font-bold text-sm text-zinc-950">Write a Review</h3>

      {/* Star picker */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-2">Your Rating *</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded"
            >
              <svg
                className={`w-7 h-7 transition-colors ${
                  star <= displayRating
                    ? 'fill-orange-500 text-orange-500'
                    : 'fill-zinc-200 text-zinc-200'
                }`}
                viewBox="0 0 24 24"
                strokeWidth={0}
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          ))}
          {displayRating > 0 && (
            <span className="ml-2 text-xs font-semibold text-orange-700">
              {ratingLabels[displayRating]}
            </span>
          )}
        </div>
      </div>

      {/* Headline */}
      <div>
        <label htmlFor="review-title" className="block text-xs font-medium text-zinc-700 mb-1.5">
          Review Headline *
        </label>
        <input
          id="review-title"
          type="text"
          placeholder="Sum up your experience in one line"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          className="w-full h-10 px-3.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20"
        />
      </div>

      {/* Comment */}
      <div>
        <label htmlFor="review-comment" className="block text-xs font-medium text-zinc-700 mb-1.5">
          Your Review *
        </label>
        <textarea
          id="review-comment"
          placeholder="Share your honest opinion about the quality, design, and delivery experience..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={1200}
          className="w-full px-3.5 py-2.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20 resize-none"
        />
        <p className="text-[10px] text-zinc-400 text-right mt-0.5">{comment.length}/1200</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="sm"
        isLoading={isSubmitting}
        rightIcon={<Send className="w-3.5 h-3.5" />}
        className="w-full sm:w-auto"
      >
        Submit Review
      </Button>
    </form>
  );
}
