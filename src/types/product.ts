export type ProductStatus = 'draft' | 'active' | 'out_of_stock' | 'archived';

export interface ProductImage {
  url: string;
  path: string; // Storage path
  altText?: string;
  isPrimary: boolean;
}

export interface ProductVariant {
  sku: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  attributes: Record<string, string>; // e.g. { color: "Espresso", material: "Walnut" }
}

export interface Product {
  id: string;
  sellerId: string;
  sellerStoreName: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  costPerItem?: number; // Dropshipping wholesale cost (seller-only private view)
  sku: string;
  barcode?: string;
  stock: number;
  lowStockThreshold: number;
  categoryId: string;
  categorySlug: string;
  tags: string[];
  images: ProductImage[];
  hasVariants: boolean;
  variants?: ProductVariant[];
  status: ProductStatus;
  ratings: {
    average: number;
    count: number;
  };
  salesCount: number;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  parentId?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFilterParams {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'featured' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
  searchQuery?: string;
  inStockOnly?: boolean;
}
