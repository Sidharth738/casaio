import { NextRequest, NextResponse } from 'next/server';
import { getActiveProductBySlug, getPublicProducts } from '@/lib/firebase/server-catalog';

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug');
    if (slug) {
      const product = await getActiveProductBySlug(slug);
      return NextResponse.json({ product }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
    }

    const products = await getPublicProducts();
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load the product catalogue' }, { status: 503 });
  }
}
