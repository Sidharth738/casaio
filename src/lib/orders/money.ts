/** Converts an INR amount to paise using deterministic half-up rounding. */
export function rupeesToPaise(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Currency amount must be a finite non-negative number.');
  }

  const [mantissa, exponentText] = amount.toString().toLowerCase().split('e');
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = `${whole}${fraction}` || '0';
  const scale = exponent - fraction.length + 2;
  const cut = digits.length + scale;
  const paiseDigits = cut <= 0
    ? '0'
    : digits.slice(0, cut).padEnd(cut, '0');
  let paise = Number(paiseDigits);
  const roundingDigit = cut < 0 ? '0' : (digits[cut] || '0');
  if (roundingDigit >= '5') paise += 1;

  if (!Number.isSafeInteger(paise)) {
    throw new RangeError('Currency amount exceeds the supported precision.');
  }
  return paise;
}

export function paiseToRupees(amountInPaise: number): number {
  if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 0) {
    throw new RangeError('Currency amount in paise must be a safe non-negative integer.');
  }
  return amountInPaise / 100;
}

export function calculateItemsSubtotal(items: Array<{ unitPrice: number; quantity: number }>): number {
  let subtotalPaise = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError('Item quantity must be a positive safe integer.');
    }
    const lineTotalPaise = rupeesToPaise(item.unitPrice) * item.quantity;
    if (!Number.isSafeInteger(lineTotalPaise) || !Number.isSafeInteger(subtotalPaise + lineTotalPaise)) {
      throw new RangeError('Order subtotal exceeds the supported precision.');
    }
    subtotalPaise += lineTotalPaise;
  }
  return paiseToRupees(subtotalPaise);
}
