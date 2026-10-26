import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const localFirebaseEmulatorsEnabled = process.env.NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS === 'true';
    const hasServiceAccountKey = Boolean(
      process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
    );
    const hasCredentialFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!localFirebaseEmulatorsEnabled && !hasServiceAccountKey && !hasCredentialFile && process.env.NODE_ENV !== 'production') {
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

    // Read, validate, and bootstrap the profile in one transaction. Competing
    // sign-ins must not overwrite a profile created by another request.
    const userDocRef = adminDb.collection('users').doc(uid);
    const role = await adminDb.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      const profileRole = userDoc.exists
        ? (userDoc.data()?.role as string) || 'customer'
        : 'customer';

      if (userDoc.data()?.status === 'suspended') {
        throw Object.assign(new Error('Account is suspended'), { statusCode: 403 });
      }

      // Only an existing admin profile can bypass email verification. Never
      // create a profile for an unverified password account.
      if (
        decodedToken.firebase.sign_in_provider === 'password' &&
        decodedToken.email_verified !== true &&
        (!userDoc.exists || profileRole !== 'admin')
      ) {
        throw Object.assign(new Error('Verify your email before signing in.'), {
          statusCode: 403,
          code: 'auth/email-not-verified',
        });
      }

      if (!userDoc.exists) {
        // First-time social sign-in or missing verified user profile.
        const now = new Date().toISOString();
        transaction.create(userDocRef, {
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

      return profileRole;
    });

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
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const code = (error as { code?: string })?.code;
    return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status: statusCode || 401 });
  }
}
