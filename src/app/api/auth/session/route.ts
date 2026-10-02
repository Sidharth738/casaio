import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const hasServiceAccountKey = Boolean(
      process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
    );
    const hasCredentialFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!hasServiceAccountKey && !hasCredentialFile && process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        {
          error:
            'Firebase Admin credentials are missing. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.local, or configure GOOGLE_APPLICATION_CREDENTIALS, then restart the dev server.',
        },
        { status: 503 }
      );
    }

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

    if (userDoc.data()?.status === 'suspended') {
      return NextResponse.json({ error: 'Account is suspended' }, { status: 403 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: 1000 * 60 * 60 * 24 * 5,
    });

    const response = NextResponse.json({
      success: true,
      user: { uid, email, role },
    });

    // Set secure HTTP-only cookie for Edge Middleware access
    response.cookies.set({
      name: 'casaio_session',
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 5,
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Session creation failed';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
