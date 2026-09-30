import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
    }

    // Verify token using Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // Fetch user document from Firestore to ensure consistent role resolution
    const userDocRef = adminDb.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    let role = (decodedToken.role as string) || 'customer';

    if (!userDoc.exists) {
      // First-time social sign-in or missing doc: initialize user document
      const now = new Date().toISOString();
      const newUser = {
        uid,
        email: email || '',
        displayName: name || email?.split('@')[0] || 'Customer',
        photoURL: picture || '',
        role: 'customer',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await userDocRef.set(newUser);
      role = 'customer';
    } else {
      const data = userDoc.data();
      if (data?.role) {
        role = data.role;
      }
    }

    // Prepare session payload
    const sessionData = {
      uid,
      email,
      role,
      token: idToken,
    };

    const response = NextResponse.json({
      success: true,
      user: { uid, email, role },
    });

    // Set secure HTTP-only cookie for Edge Middleware access
    response.cookies.set({
      name: 'casaio_session',
      value: JSON.stringify(sessionData),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Session creation failed';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
