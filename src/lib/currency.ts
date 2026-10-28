export const BASE_CURRENCY = 'INR' as const;
export const DEFAULT_REGION_CODE = 'US' as const;

export type SupportedCurrency =
  | 'INR'
  | 'USD'
  | 'GBP'
  | 'EUR'
  | 'AED'
  | 'SGD'
  | 'AUD'
  | 'CAD'
  | 'JPY';

export interface RegionOption {
  code: string;
  name: string;
  currency: SupportedCurrency;
  locale: string;
  callingCode: string;
}

export const REGIONS: RegionOption[] = [
  { code: 'IN', name: 'India', currency: 'INR', locale: 'en-IN', callingCode: '+91' },
  { code: 'US', name: 'United States', currency: 'USD', locale: 'en-US', callingCode: '+1' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', callingCode: '+44' },
  { code: 'DE', name: 'Germany', currency: 'EUR', locale: 'de-DE', callingCode: '+49' },
  { code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR', callingCode: '+33' },
  { code: 'IT', name: 'Italy', currency: 'EUR', locale: 'it-IT', callingCode: '+39' },
  { code: 'ES', name: 'Spain', currency: 'EUR', locale: 'es-ES', callingCode: '+34' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', locale: 'nl-NL', callingCode: '+31' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', locale: 'en-IE', callingCode: '+353' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', locale: 'en-AE', callingCode: '+971' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', locale: 'en-SG', callingCode: '+65' },
  { code: 'AU', name: 'Australia', currency: 'AUD', locale: 'en-AU', callingCode: '+61' },
  { code: 'CA', name: 'Canada', currency: 'CAD', locale: 'en-CA', callingCode: '+1' },
  { code: 'JP', name: 'Japan', currency: 'JPY', locale: 'ja-JP', callingCode: '+81' },
];

export const SUPPORTED_CURRENCIES = REGIONS.map((region) => region.currency);

export function getRegion(code: string) {
  return REGIONS.find((region) => region.code === code) || REGIONS.find((region) => region.code === DEFAULT_REGION_CODE)!;
}

export function getRegionCodeForCountry(country: string) {
  const normalized = country.trim().toLowerCase();
  return REGIONS.find((region) =>
    region.code.toLowerCase() === normalized || region.name.toLowerCase() === normalized,
  )?.code || 'IN';
}

export function formatConvertedCurrency(
  amountInr: number,
  currency: SupportedCurrency,
  rate: number,
  locale: string,
) {
  const amount = currency === BASE_CURRENCY ? amountInr : amountInr * rate;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'INR' || currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'INR' || currency === 'JPY' ? 0 : 2,
  }).format(amount);
}
