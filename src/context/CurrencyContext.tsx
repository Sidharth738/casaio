'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BASE_CURRENCY,
  DEFAULT_REGION_CODE,
  getRegion,
  formatConvertedCurrency,
  type RegionOption,
  type SupportedCurrency,
} from '@/lib/currency';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'casaio-region';

interface CurrencyContextValue {
  region: RegionOption;
  currency: SupportedCurrency;
  rate: number;
  rateDate: string | null;
  isRateLoading: boolean;
  setRegion: (code: string) => void;
  formatPrice: (amountInr: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

function detectRegion() {
  if (typeof navigator === 'undefined') return DEFAULT_REGION_CODE;
  const language = navigator.language.toLowerCase();
  if (language.includes('-us')) return 'US';
  if (language.includes('-gb')) return 'GB';
  if (language.includes('-ae')) return 'AE';
  if (language.includes('-sg')) return 'SG';
  if (language.includes('-au')) return 'AU';
  if (language.includes('-ca')) return 'CA';
  if (language.includes('-jp')) return 'JP';
  if (language.startsWith('de')) return 'DE';
  if (language.startsWith('fr')) return 'FR';
  if (language.startsWith('it')) return 'IT';
  if (language.startsWith('es')) return 'ES';
  if (language.startsWith('nl')) return 'NL';
  if (language.startsWith('pt') || language.startsWith('en-ie')) return 'IE';
  return DEFAULT_REGION_CODE;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [regionCode, setRegionCode] = useState<string>(DEFAULT_REGION_CODE);
  const [rates, setRates] = useState<Record<string, number>>({ [BASE_CURRENCY]: 1 });
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [isRateLoading, setIsRateLoading] = useState(true);

  useEffect(() => {
    fetch('/api/exchange-rates')
      .then((response) => response.json())
      .then((data: { rates?: Record<string, number>; asOf?: string | null }) => {
        if (data.rates) setRates(data.rates);
        setRateDate(data.asOf || null);
      })
      .catch(() => {})
      .finally(() => setIsRateLoading(false));
  }, []);

  useEffect(() => {
    if (authLoading) return;

    // Regional preferences are session-specific. A signed-out storefront
    // must never reuse the previous customer's currency from local storage.
    const nextRegion = user
      ? window.localStorage.getItem(STORAGE_KEY) || detectRegion()
      : DEFAULT_REGION_CODE;
    window.localStorage.setItem(STORAGE_KEY, nextRegion);
    const regionTimer = window.setTimeout(() => setRegionCode(nextRegion), 0);

    return () => window.clearTimeout(regionTimer);
  }, [authLoading, user]);

  const region = getRegion(regionCode);
  const rate = rates[region.currency] || 1;

  const setRegion = useCallback((code: string) => {
    const nextRegion = getRegion(code);
    setRegionCode(nextRegion.code);
    window.localStorage.setItem(STORAGE_KEY, nextRegion.code);
  }, []);

  const formatPrice = useCallback(
    (amountInr: number) => formatConvertedCurrency(amountInr, region.currency, rate, region.locale),
    [rate, region.currency, region.locale],
  );

  const value = useMemo(() => ({
    region,
    currency: region.currency,
    rate,
    rateDate,
    isRateLoading,
    setRegion,
    formatPrice,
  }), [formatPrice, isRateLoading, rate, rateDate, region, setRegion]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used inside CurrencyProvider');
  return context;
}
