import { SellerProductUpdateSchema } from '@/lib/validators/product';

export type SellerUpdateUser = { uid: string; role: string; sellerStatus?: string } | null;
export type SellerUpdateProduct = Record<string, unknown> & {
  sellerId?: string;
  slug?: string;
  categoryId?: string;
  categorySlug?: string;
};
export type SellerUpdateCategory = { slug: string; isActive: boolean };

export interface SellerProductUpdateStore {
  getProduct(id: string): Promise<SellerUpdateProduct | null>;
  getCategory(id: string): Promise<SellerUpdateCategory | null>;
  findProductIdsBySlug(slug: string): Promise<string[]>;
  updateProduct(id: string, updates: Record<string, unknown>): Promise<void>;
}

export type SellerProductUpdateResult = {
  status: number;
  body: { success?: boolean; message?: string; error?: string };
  previousSlug?: string;
  slug?: string;
};

export async function processSellerProductUpdate(
  user: SellerUpdateUser,
  productId: string,
  body: unknown,
  store: SellerProductUpdateStore,
  now = new Date().toISOString(),
): Promise<SellerProductUpdateResult> {
  if (!user || user.role !== 'seller') {
    return { status: 403, body: { error: 'Seller access required' } };
  }

  if (user.sellerStatus !== undefined && user.sellerStatus !== 'approved') {
    return { status: 403, body: { error: 'An approved seller profile is required to update products' } };
  }

  const product = await store.getProduct(productId);
  if (!product) return { status: 404, body: { error: 'Product not found' } };
  if (product.sellerId !== user.uid) {
    return { status: 403, body: { error: 'Unauthorized: you do not own this product' } };
  }

  const parsed = SellerProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: parsed.error.issues[0]?.message || 'Invalid product details' },
    };
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No product changes provided' } };
  }

  if (typeof updates.slug === 'string') {
    const matchingIds = await store.findProductIdsBySlug(updates.slug);
    if (matchingIds.some((id) => id !== productId)) {
      return { status: 409, body: { error: 'A product with this URL slug already exists' } };
    }
  }

  const categoryWasSupplied = updates.categoryId !== undefined || updates.categorySlug !== undefined;
  if (categoryWasSupplied) {
    const categoryId = typeof updates.categoryId === 'string'
      ? updates.categoryId
      : product.categoryId;
    if (!categoryId) {
      return { status: 400, body: { error: 'Choose an active category' } };
    }
    const category = await store.getCategory(categoryId);
    if (!category || category.isActive !== true) {
      return { status: 400, body: { error: 'Choose an active category' } };
    }
    if (updates.categorySlug !== undefined && updates.categorySlug !== category.slug) {
      return { status: 400, body: { error: 'Category slug does not match the selected category' } };
    }
    // Store the canonical slug, including when a caller supplied only categoryId.
    updates.categorySlug = category.slug;
  }

  await store.updateProduct(productId, { ...updates, updatedAt: now });
  return {
    status: 200,
    body: { success: true, message: 'Product updated successfully' },
    previousSlug: product.slug,
    slug: typeof updates.slug === 'string' ? updates.slug : product.slug,
  };
}
