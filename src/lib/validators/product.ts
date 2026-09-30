import { z } from 'zod';

export const CategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url('Must be a valid URL').optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const ProductImageSchema = z.object({
  url: z.string().url(),
  path: z.string(),
  altText: z.string().max(200).optional(),
  isPrimary: z.boolean(),
});

export const ProductVariantSchema = z.object({
  sku: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  price: z.number().positive('Price must be greater than 0'),
  compareAtPrice: z.number().positive().optional(),
  stock: z.number().int().min(0),
  attributes: z.record(z.string(), z.string()),
});

export const ProductSchema = z.object({
  sellerId: z.string().min(1),
  sellerStoreName: z.string().min(1).max(100),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  slug: z.string().min(3).max(220).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  shortDescription: z.string().max(300).optional(),
  price: z.number().positive('Price must be greater than 0'),
  compareAtPrice: z.number().positive().optional(),
  costPerItem: z.number().positive().optional(),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  stock: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  categoryId: z.string().min(1),
  categorySlug: z.string().min(1),
  tags: z.array(z.string()).max(20).default([]),
  images: z.array(ProductImageSchema).min(1, 'At least one image is required').max(10),
  hasVariants: z.boolean().default(false),
  variants: z.array(ProductVariantSchema).optional(),
  status: z.enum(['draft', 'active', 'out_of_stock', 'archived']).default('draft'),
  isFeatured: z.boolean().default(false),
});

export const CreateProductSchema = ProductSchema;
export const UpdateProductSchema = ProductSchema.partial().omit({ sellerId: true });

export type CategoryInput = z.infer<typeof CategorySchema>;
export type ProductInput = z.infer<typeof ProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
