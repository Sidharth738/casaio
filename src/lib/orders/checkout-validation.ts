import type { OrderItem, OrderPricing, ProductVariant, UserAddress } from '@/types';

export interface ValidatedShippingAddressResult {
  isValid: boolean;
  error?: string;
  cleanAddress?: UserAddress;
}

export interface PurchasableProductValidationResult {
  isValid: boolean;
  error?: string;
  verifiedItem?: OrderItem;
}

export interface CouponRule {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue?: number;
  maxDiscountAmount?: number;
  validFrom?: string;
  validUntil?: string;
  usageLimit?: number;
  usageCount?: number;
  isActive?: boolean;
}

export interface FirestoreCouponValidationResult {
  isValid: boolean;
  error?: string;
  couponRule?: CouponRule;
}

/**
 * Firestore coupons use the required finite usageLimit/usageCount fields from
 * the Coupon schema. Missing or malformed values are invalid; they never imply
 * an unlimited coupon. The caller must pass a transaction snapshot for uses
 * that will be consumed by an order.
 */
export function validateFirestoreCoupon(
  value: unknown,
  now = new Date()
): FirestoreCouponValidationResult {
  if (!value || typeof value !== 'object') {
    return { isValid: false, error: 'Coupon is unavailable.' };
  }

  const data = value as Record<string, unknown>;
  if (data.isActive !== true) return { isValid: false, error: 'Coupon is inactive.' };
  if (typeof data.code !== 'string' || !data.code.trim()) {
    return { isValid: false, error: 'Coupon configuration is invalid.' };
  }
  if (data.discountType !== 'percentage' && data.discountType !== 'flat') {
    return { isValid: false, error: 'Coupon configuration is invalid.' };
  }
  if (typeof data.discountValue !== 'number' || !Number.isFinite(data.discountValue) || data.discountValue < 0) {
    return { isValid: false, error: 'Coupon configuration is invalid.' };
  }

  const validFrom = typeof data.validFrom === 'string' ? Date.parse(data.validFrom) : Number.NaN;
  const validUntil = typeof data.validUntil === 'string' ? Date.parse(data.validUntil) : Number.NaN;
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validFrom > validUntil) {
    return { isValid: false, error: 'Coupon validity window is invalid.' };
  }
  if (now.getTime() < validFrom || now.getTime() > validUntil) {
    return { isValid: false, error: 'Coupon is expired or not yet valid.' };
  }

  const usageLimit = data.usageLimit;
  const usageCount = data.usageCount;
  if (!Number.isSafeInteger(usageLimit) || (usageLimit as number) < 0 ||
      !Number.isSafeInteger(usageCount) || (usageCount as number) < 0) {
    return { isValid: false, error: 'Coupon usage configuration is invalid.' };
  }
  if ((usageCount as number) >= (usageLimit as number)) {
    return { isValid: false, error: 'Coupon usage limit has been reached.' };
  }

  const minOrderValue = data.minOrderValue;
  const maxDiscountAmount = data.maxDiscountAmount;
  if (minOrderValue !== undefined && (typeof minOrderValue !== 'number' || !Number.isFinite(minOrderValue) || minOrderValue < 0)) {
    return { isValid: false, error: 'Coupon configuration is invalid.' };
  }
  if (maxDiscountAmount !== undefined && (typeof maxDiscountAmount !== 'number' || !Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) {
    return { isValid: false, error: 'Coupon configuration is invalid.' };
  }

  return {
    isValid: true,
    couponRule: {
      code: data.code.trim().toUpperCase(),
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderValue: minOrderValue as number | undefined,
      maxDiscountAmount: maxDiscountAmount as number | undefined,
      validFrom: data.validFrom as string,
      validUntil: data.validUntil as string,
      usageLimit: usageLimit as number,
      usageCount: usageCount as number,
      isActive: true,
    },
  };
}

export interface StockUpdateResult {
  isValid: boolean;
  error?: string;
  updatePayload?: {
    stock: number;
    salesCount: number;
    status: 'active' | 'out_of_stock' | 'draft' | 'archived';
    variants?: ProductVariant[];
    updatedAt: string;
  };
}

/**
 * Validates shipping address fields, ensuring all required delivery details are present and non-blank.
 */
export function validateShippingAddress(address: unknown): ValidatedShippingAddressResult {
  if (!address || typeof address !== 'object') {
    return { isValid: false, error: 'Valid shipping address is required.' };
  }

  const raw = address as Partial<UserAddress>;

  const fullName = typeof raw.fullName === 'string' ? raw.fullName.trim() : '';
  const phoneNumber = typeof raw.phoneNumber === 'string' ? raw.phoneNumber.trim() : '';
  const addressLine1 = typeof raw.addressLine1 === 'string' ? raw.addressLine1.trim() : '';
  const city = typeof raw.city === 'string' ? raw.city.trim() : '';
  const state = typeof raw.state === 'string' ? raw.state.trim() : '';
  const postalCode = typeof raw.postalCode === 'string' ? raw.postalCode.trim() : '';
  const country = typeof raw.country === 'string' && raw.country.trim() ? raw.country.trim() : 'India';

  if (!fullName) return { isValid: false, error: 'Full recipient name is required in shipping address.' };
  if (!phoneNumber || phoneNumber.length < 5) return { isValid: false, error: 'Valid contact phone number is required in shipping address.' };
  if (!addressLine1) return { isValid: false, error: 'Address line 1 is required in shipping address.' };
  if (!city) return { isValid: false, error: 'City is required in shipping address.' };
  if (!state) return { isValid: false, error: 'State is required in shipping address.' };
  if (!postalCode) return { isValid: false, error: 'Postal code is required in shipping address.' };

  const cleanAddress: UserAddress = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `addr_${Date.now()}`,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    fullName,
    phoneNumber,
    alternatePhone: typeof raw.alternatePhone === 'string' && raw.alternatePhone.trim() ? raw.alternatePhone.trim() : undefined,
    addressLine1,
    addressLine2: typeof raw.addressLine2 === 'string' && raw.addressLine2.trim() ? raw.addressLine2.trim() : undefined,
    landmark: typeof raw.landmark === 'string' && raw.landmark.trim() ? raw.landmark.trim() : undefined,
    city,
    state,
    postalCode,
    country,
    addressType: raw.addressType === 'work' || raw.addressType === 'other' ? raw.addressType : 'home',
    isDefault: Boolean(raw.isDefault),
    coordinates: raw.coordinates && typeof raw.coordinates.lat === 'number' && typeof raw.coordinates.lng === 'number'
      ? { lat: raw.coordinates.lat, lng: raw.coordinates.lng }
      : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  };

  return { isValid: true, cleanAddress };
}

/**
 * Validates a single cart item against authentic Firestore product data.
 * Derives prices, titles, images, stock, and seller IDs purely from server data.
 * Wholesale dropshipping cost (`costPerItem`) is strictly never attached to OrderItem.
 */
export function validatePurchasableProduct(
  productData: Record<string, unknown> | null | undefined,
  requestedItem: { productId: string; variantSku?: string; quantity: number }
): PurchasableProductValidationResult {
  if (!productData) {
    return { isValid: false, error: 'Product is no longer available in the catalogue.' };
  }

  // 1. Product must be in 'active' status to be purchasable
  if (productData.status !== 'active') {
    const statusLabel = typeof productData.status === 'string' ? productData.status : 'unavailable';
    return {
      isValid: false,
      error: `Product "${(productData.title as string) || requestedItem.productId}" is currently unavailable (${statusLabel}).`,
    };
  }

  // 2. Validate requested quantity
  const quantity = Number(requestedItem.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { isValid: false, error: 'Invalid product quantity requested.' };
  }

  // 3. Variant integrity validation
  const hasVariants = Boolean(productData.hasVariants) || (Array.isArray(productData.variants) && productData.variants.length > 0);
  let authoritativePrice = 0;
  let variantSku: string | undefined = undefined;
  let itemTitle = typeof productData.title === 'string' ? productData.title : 'Artisanal Product';

  if (hasVariants) {
    const cleanVariantSku = typeof requestedItem.variantSku === 'string' ? requestedItem.variantSku.trim() : '';
    if (!cleanVariantSku) {
      return {
        isValid: false,
        error: `Product "${productData.title}" requires a variant selection.`,
      };
    }

    const variants: ProductVariant[] = Array.isArray(productData.variants) ? productData.variants : [];
    const matchedVariant = variants.find((v) => v.sku === cleanVariantSku);

    if (!matchedVariant) {
      return {
        isValid: false,
        error: `Variant "${cleanVariantSku}" for product "${productData.title}" does not exist.`,
      };
    }

    const vPrice = Number(matchedVariant.price);
    if (!Number.isFinite(vPrice) || vPrice <= 0) {
      return { isValid: false, error: 'Invalid variant price configuration in catalogue.' };
    }

    const vStock = Number(matchedVariant.stock ?? 0);
    if (vStock < quantity) {
      return {
        isValid: false,
        error: `Insufficient stock for "${productData.title} (${matchedVariant.title || cleanVariantSku})". Available: ${vStock}, Requested: ${quantity}.`,
      };
    }

    authoritativePrice = vPrice;
    variantSku = matchedVariant.sku;
    itemTitle = matchedVariant.title
      ? `${typeof productData.title === 'string' ? productData.title : 'Product'} (${matchedVariant.title})`
      : (typeof productData.title === 'string' ? productData.title : 'Artisanal Product');
  } else {
    // Product does not have variants
    if (typeof requestedItem.variantSku === 'string' && requestedItem.variantSku.trim()) {
      const cleanSku = requestedItem.variantSku.trim();
      // If client supplied a variantSku that does not match product.sku, reject
      if (!productData.sku || cleanSku !== productData.sku) {
        return {
          isValid: false,
          error: `Product "${productData.title}" does not support variant "${cleanSku}".`,
        };
      }
    }

    const pPrice = Number(productData.price);
    if (!Number.isFinite(pPrice) || pPrice <= 0) {
      return { isValid: false, error: 'Invalid product price configuration in catalogue.' };
    }

    const pStock = Number(productData.stock ?? 0);
    if (pStock < quantity) {
      return {
        isValid: false,
        error: `Insufficient stock for "${productData.title}". Available: ${pStock}, Requested: ${quantity}.`,
      };
    }

    authoritativePrice = pPrice;
  }

  // 4. Server-authoritative seller details
  const sellerId = typeof productData.sellerId === 'string' && productData.sellerId.trim()
    ? productData.sellerId.trim()
    : 'casaio-direct';
  const sellerStoreName = typeof productData.sellerStoreName === 'string' && productData.sellerStoreName.trim()
    ? productData.sellerStoreName.trim()
    : 'Casaio Artisans';

  // 5. Server-authoritative image URL
  const images = Array.isArray(productData.images)
    ? (productData.images as Array<{ isPrimary?: boolean; url?: string }>)
    : [];
  const primaryImg = images.find((img) => img.isPrimary)?.url || images[0]?.url || '';

  const verifiedItem: OrderItem = {
    productId: requestedItem.productId,
    ...(variantSku ? { variantSku } : {}),
    title: itemTitle,
    slug: typeof productData.slug === 'string' ? productData.slug : '',
    imageUrl: primaryImg,
    unitPrice: authoritativePrice,
    quantity,
    totalPrice: authoritativePrice * quantity,
    sellerId,
    sellerStoreName,
    fulfillmentStatus: 'pending',
  };

  return { isValid: true, verifiedItem };
}

/**
 * Calculates authoritative order totals: subtotal, discount, shipping, tax breakdown, and total.
 */
export function calculateAuthoritativePricing(
  subtotal: number,
  coupon?: CouponRule | null
): { pricing: OrderPricing; appliedCoupon?: { code: string; discountValue: number } } {
  let discountAmount = 0;
  let appliedCoupon: { code: string; discountValue: number } | undefined = undefined;

  if (coupon && coupon.isActive !== false) {
    const now = new Date().toISOString();

    const isDateValid = (!coupon.validFrom || coupon.validFrom <= now) &&
      (!coupon.validUntil || coupon.validUntil >= now);

    const isUsageValid = typeof coupon.usageLimit !== 'number' ||
      (typeof coupon.usageCount === 'number' && Number.isSafeInteger(coupon.usageCount) &&
        coupon.usageCount >= 0 && coupon.usageCount < coupon.usageLimit);

    const meetsMinOrder = !coupon.minOrderValue || subtotal >= coupon.minOrderValue;

    if (isDateValid && isUsageValid && meetsMinOrder) {
      if (coupon.discountType === 'percentage') {
        discountAmount = Math.round((subtotal * coupon.discountValue) / 100);
        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
          discountAmount = coupon.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(coupon.discountValue, subtotal);
      }
      appliedCoupon = { code: coupon.code, discountValue: discountAmount };
    }
  }

  const shippingFee = 0; // Complimentary white-glove courier shipping
  const taxAmount = Math.round(Math.max(0, subtotal - discountAmount) * 0.18);
  const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

  return {
    pricing: {
      subtotal,
      discountAmount,
      shippingFee,
      taxAmount,
      totalAmount,
    },
    appliedCoupon,
  };
}

/**
 * Prepares atomic stock deduction updates for a product within a Firestore transaction.
 * Supports products with variants and base products.
 * Transitions product status to 'out_of_stock' if remaining stock hits 0.
 */
export function calculateStockUpdates(
  productData: Record<string, unknown> | null | undefined,
  requestedItems: Array<{ variantSku?: string; quantity: number }>
): StockUpdateResult {
  if (!productData) {
    return { isValid: false, error: 'Product does not exist in catalogue.' };
  }

  if (productData.status !== 'active') {
    return {
      isValid: false,
      error: `Product "${productData.title || 'Product'}" is not active for checkout (${productData.status || 'unavailable'}).`,
    };
  }

  const hasVariants = Boolean(productData.hasVariants) || (Array.isArray(productData.variants) && productData.variants.length > 0);
  const now = new Date().toISOString();
  const currentSalesCount = Number(productData.salesCount || 0);

  if (hasVariants) {
    const rawVariants: ProductVariant[] = Array.isArray(productData.variants) ? productData.variants : [];
    const updatedVariants: ProductVariant[] = rawVariants.map((v) => ({ ...v }));

    let totalRequestedQuantity = 0;

    for (const req of requestedItems) {
      const cleanSku = typeof req.variantSku === 'string' ? req.variantSku.trim() : '';
      if (!cleanSku) {
        return { isValid: false, error: `Variant SKU is required for product "${productData.title}".` };
      }

      const variantIndex = updatedVariants.findIndex((v) => v.sku === cleanSku);
      if (variantIndex === -1) {
        return { isValid: false, error: `Variant "${cleanSku}" does not exist on product "${productData.title}".` };
      }

      const targetVariant = updatedVariants[variantIndex];
      const availableStock = Number(targetVariant.stock ?? 0);
      if (availableStock < req.quantity) {
        return {
          isValid: false,
          error: `Insufficient stock for "${productData.title} (${targetVariant.title || cleanSku})". Available: ${availableStock}, Requested: ${req.quantity}.`,
        };
      }

      targetVariant.stock = availableStock - req.quantity;
      totalRequestedQuantity += req.quantity;
    }

    const currentBaseStock = Number(productData.stock ?? 0);
    if (currentBaseStock < totalRequestedQuantity) {
      return {
        isValid: false,
        error: `Insufficient aggregate stock for "${productData.title}". Available: ${currentBaseStock}, Requested: ${totalRequestedQuantity}.`,
      };
    }

    const newBaseStock = currentBaseStock - totalRequestedQuantity;
    const allVariantsEmpty = updatedVariants.every((v) => (v.stock ?? 0) <= 0);
    const newStatus = (newBaseStock <= 0 || allVariantsEmpty)
      ? 'out_of_stock'
      : (productData.status as 'active' | 'out_of_stock' | 'draft' | 'archived');

    return {
      isValid: true,
      updatePayload: {
        stock: newBaseStock,
        salesCount: currentSalesCount + totalRequestedQuantity,
        status: newStatus,
        variants: updatedVariants,
        updatedAt: now,
      },
    };
  } else {
    // Base product without variants
    const totalRequestedQuantity = requestedItems.reduce((sum, item) => sum + item.quantity, 0);
    const currentStock = Number(productData.stock ?? 0);

    if (currentStock < totalRequestedQuantity) {
      return {
        isValid: false,
        error: `Insufficient stock for "${productData.title}". Available: ${currentStock}, Requested: ${totalRequestedQuantity}.`,
      };
    }

    const newStock = currentStock - totalRequestedQuantity;
    const newStatus = newStock <= 0
      ? 'out_of_stock'
      : (productData.status as 'active' | 'out_of_stock' | 'draft' | 'archived');

    return {
      isValid: true,
      updatePayload: {
        stock: newStock,
        salesCount: currentSalesCount + totalRequestedQuantity,
        status: newStatus,
        updatedAt: now,
      },
    };
  }
}
