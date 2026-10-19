import type { Product } from '@/types';

/** Return only fields intended for the public storefront. */
export function toPublicProduct(product: Product): Product {
  const publicProduct = { ...product };
  delete publicProduct.costPerItem;
  return publicProduct as Product;
}
