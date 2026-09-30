export interface WishlistItem {
  productId: string;
  title: string;
  slug: string;
  imageUrl: string;
  price: number;
  compareAtPrice?: number;
  sellerStoreName: string;
  inStock: boolean;
  addedAt: string;
}

export interface Wishlist {
  userId: string;
  items: WishlistItem[];
  updatedAt: string;
}
