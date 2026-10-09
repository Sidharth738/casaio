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

    const role = userDoc.exists
      ? (userDoc.data()?.role as string) || 'customer'
      : 'customer';

    if (userDoc.data()?.status === 'suspended') {
      return NextResponse.json({ error: 'Account is suspended' }, { status: 403 });
    }

    // Only an existing admin profile can bypass email verification. Never
    // create a profile for an unverified password account.
    if (
      decodedToken.firebase.sign_in_provider === 'password' &&
      decodedToken.email_verified !== true &&
      (!userDoc.exists || role !== 'admin')
    ) {
      return NextResponse.json(
        { code: 'auth/email-not-verified', error: 'Verify your email before signing in.' },
        { status: 403 }
      );
    }

    if (!userDoc.exists) {
      // First-time social sign-in or missing verified user profile.
      const now = new Date().toISOString();
      await userDocRef.set({
        uid,
        email: email || '',
        displayName: name || email?.split('@')[0] || 'Customer',
        photoURL: picture || '',
        role: 'customer',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
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
