import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { SellerApplicationSchema } from '@/lib/validators/seller-profile';

export async function POST(request: NextRequest) {
  try {
    const user = await requireServerUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const parsed = SellerApplicationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid seller application' }, { status: 400 });
    }

    const sellerRef = adminDb.collection('sellers').doc(user.uid);
    if ((await sellerRef.get()).exists) {
      return NextResponse.json({ error: 'A seller application already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const storeSlug = parsed.data.storeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await sellerRef.create({
      id: user.uid,
      ...parsed.data,
      storeSlug,
      status: 'pending',
      commissionRatePercent: 10,
      metrics: { totalSalesAmount: 0, totalOrdersCount: 0, ratingAverage: 5, ratingCount: 0 },
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    console.error('Seller application submission failed:', error);
    return NextResponse.json({ error: 'Unable to submit seller application' }, { status: 500 });
  }
}
