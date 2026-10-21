export function normalizeCouponCode(value: unknown): string;

export function validateCouponDefinition(value: unknown):
  | { ok: true; definition: {
      code: string;
      description: string;
      discountType: 'percentage' | 'flat';
      discountValue: number;
      minOrderValue: number;
      maxDiscountAmount?: number;
      validFrom: string;
      validUntil: string;
      usageLimit: number;
      perUserLimit: number;
    } }
  | { ok: false; error: string };
