export function normalizeCouponCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function validateCouponDefinition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Coupon terms are required.' };
  const code = normalizeCouponCode(value.code);
  if (!code || code.length > 64) return { ok: false, error: 'Enter a coupon code of at most 64 characters.' };
  if (value.discountType !== 'percentage' && value.discountType !== 'flat') return { ok: false, error: 'Choose a valid discount type.' };
  if (typeof value.discountValue !== 'number' || !Number.isFinite(value.discountValue) || value.discountValue <= 0 || (value.discountType === 'percentage' && value.discountValue > 100)) {
    return { ok: false, error: 'Enter a valid discount value.' };
  }
  if (typeof value.minOrderValue !== 'number' || !Number.isFinite(value.minOrderValue) || value.minOrderValue < 0) return { ok: false, error: 'Enter a valid minimum order value.' };
  if (value.maxDiscountAmount !== undefined && value.maxDiscountAmount !== null && (typeof value.maxDiscountAmount !== 'number' || !Number.isFinite(value.maxDiscountAmount) || value.maxDiscountAmount <= 0)) {
    return { ok: false, error: 'Enter a valid maximum discount.' };
  }
  const validFrom = typeof value.validFrom === 'string' ? Date.parse(value.validFrom) : NaN;
  const validUntil = typeof value.validUntil === 'string' ? Date.parse(value.validUntil) : NaN;
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validFrom > validUntil) return { ok: false, error: 'Enter a valid promotion date range.' };
  if (!Number.isSafeInteger(value.usageLimit) || value.usageLimit < 0) return { ok: false, error: 'Usage limit must be a nonnegative whole number. Zero disables redemption.' };
  if (value.perUserLimit !== undefined && (!Number.isSafeInteger(value.perUserLimit) || value.perUserLimit < 1)) return { ok: false, error: 'Per-user limit must be a positive whole number.' };
  if (typeof value.description !== 'string' || value.description.length > 300) return { ok: false, error: 'Description must be 300 characters or fewer.' };
  return {
    ok: true,
    definition: {
      code,
      description: value.description.trim(),
      discountType: value.discountType,
      discountValue: value.discountValue,
      minOrderValue: value.minOrderValue,
      ...(value.maxDiscountAmount !== undefined && value.maxDiscountAmount !== null ? { maxDiscountAmount: value.maxDiscountAmount } : {}),
      validFrom: new Date(validFrom).toISOString(),
      validUntil: new Date(validUntil).toISOString(),
      usageLimit: value.usageLimit,
      perUserLimit: value.perUserLimit ?? 1,
    },
  };
}
