import type { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export type ServerUser = { uid: string; email?: string; role: string };

export async function getServerUser(request: NextRequest): Promise<ServerUser | null> {
  const sessionCookie = request.cookies.get('casaio_session')?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const user = userSnap.data();
    if (!userSnap.exists || user?.status === 'suspended') return null;
    return { uid: decoded.uid, email: decoded.email, role: user?.role || 'customer' };
  } catch {
    return null;
  }
}

export async function requireServerUser(request: NextRequest) {
  const user = await getServerUser(request);
  return user;
}

export async function requireServerRole(request: NextRequest, roles: string[]) {
  const user = await getServerUser(request);
  return user && roles.includes(user.role) ? user : null;
}
