import { adminDb } from '@/lib/firebase/admin';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getServerUser, type ServerUser } from '@/lib/firebase/server-auth';
import type { NextRequest } from 'next/server';

type MediaAccess = { user: ServerUser | null; authorized: boolean };

function hasFileId(data: DocumentData | undefined, fileId: string) {
  return Array.isArray(data?.images) && data.images.some((image: unknown) =>
    image && typeof image === 'object' && 'path' in image && (image as { path?: unknown }).path === fileId,
  );
}

export async function authorizeTelegramMedia(request: NextRequest, fileId: string): Promise<MediaAccess> {
  const user = await getServerUser(request);
  if (!user) return { user: null, authorized: false };

  const products = user.role === 'admin'
    ? await adminDb.collection('products').get()
    : await adminDb.collection('products').where('sellerId', '==', user.uid).get();
  const linked = products.docs.some((doc: QueryDocumentSnapshot) => hasFileId(doc.data(), fileId));
  return { user, authorized: linked };
}
