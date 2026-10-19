import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { SellerProfileUpdateSchema } from '@/lib/validators/seller-profile';

export async function PUT(request: NextRequest) {
  try {
    const user = await requireServerRole(request, ['seller']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });

    const sellerRef = adminDb.collection('sellers').doc(user.uid);
    const seller = await sellerRef.get();
    if (!seller.exists || seller.data()?.status !== 'approved') {
      return NextResponse.json({ error: 'An approved seller profile is required' }, { status: 403 });
    }

    const parsed = SellerProfileUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid seller profile details' }, { status: 400 });
    }

    await sellerRef.update({ ...parsed.data, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Seller profile update failed:', error);
    return NextResponse.json({ error: 'Unable to update seller profile' }, { status: 500 });
  }
}
