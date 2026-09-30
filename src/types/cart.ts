export interface CartItem {
  productId: string;
  variantSku?: string;
  title: string;
  slug: string;
  imageUrl: string;
  unitPrice: number;
  compareAtPrice?: number;
  quantity: number;
  sellerId: string;
  sellerStoreName: string;
  maxStock: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
  updatedAt: string;
}
