import type { Review } from '@/types';

export function calculatePublishedRatings(reviews: Array<Pick<Review, 'rating' | 'status'>>) {
  const published = reviews.filter((review) => review.status === 'published');
  const count = published.length;
  const sum = published.reduce((total, review) => total + (Number(review.rating) || 5), 0);

  return {
    average: count ? Math.round((sum / count) * 10) / 10 : 5,
    count,
  };
}
