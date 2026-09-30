export type DiscountType = 'percentage' | 'flat';

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  usageCount: number;
  perUserLimit: number;
  isActive: boolean;
  createdAt: string;
}

export interface CouponValidationResult {
  isValid: boolean;
  discountAmount: number;
  message?: string;
  coupon?: Coupon;
}
