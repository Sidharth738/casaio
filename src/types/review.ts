export interface Review {
  id: string;
  productId: string;
  orderId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number; // 1-5
  title: string;
  comment: string;
  images?: string[];
  isVerifiedPurchase: boolean;
  sellerResponse?: {
    comment: string;
    respondedAt: string;
  };
  status: 'published' | 'hidden';
  createdAt: string;
}

export interface CreateReviewInput {
  productId: string;
  orderId: string;
  rating: number;
  title: string;
  comment: string;
  images?: string[];
}
