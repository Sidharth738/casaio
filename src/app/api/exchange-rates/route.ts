import { NextResponse } from 'next/server';
import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from '@/lib/currency';

export const runtime = 'edge';

export async function GET() {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Exchange-rate provider returned ${response.status}`);

    const data = await response.json() as {
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    const rates = Object.fromEntries(
      SUPPORTED_CURRENCIES.map((currency) => [currency, currency === BASE_CURRENCY ? 1 : data.rates?.[currency]])
        .filter(([, rate]) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0),
    );

    return NextResponse.json(
      { base: BASE_CURRENCY, rates, asOf: data.time_last_update_utc || new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json(
      { base: BASE_CURRENCY, rates: { [BASE_CURRENCY]: 1 }, asOf: null, fallback: true },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=300' } },
    );
  }
}
