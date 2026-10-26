'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  type ActionCodeSettings,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseEmulatorMode } from '@/lib/firebase/client';
import { UserProfile, UserRole } from '@/types/user';
import { getVerificationDeliveryMessage, type VerificationDelivery } from '@/lib/auth/verification-delivery';
import { createProfileBootstrapLoader, getProfileFailureCategory } from '@/lib/auth/profile-bootstrap';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: User | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<UserRole>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<{ verificationDelivery: VerificationDelivery; profileSaved: boolean }>;
  loginWithGoogle: () => Promise<UserRole>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: (email: string, password: string) => Promise<VerificationDelivery>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getActionCodeSettings(continuePath: string): ActionCodeSettings {
  return {
    url: new URL(continuePath, window.location.origin).toString(),
    handleCodeInApp: false,
  };
}

async function sendVerificationEmail(user: User): Promise<VerificationDelivery> {
  try {
    await sendEmailVerification(user, getActionCodeSettings('/login?verified=1'));
  } catch (error) {
    const code = (error as { code?: string }).code;
    // A misconfigured authorized continue URL should not prevent Firebase from
    // sending its standard verification link, which still verifies the account.
    if (code !== 'auth/unauthorized-continue-uri' && code !== 'auth/invalid-continue-uri') throw error;
    console.warn('Custom verification return URL was rejected; sending the standard Firebase verification link instead.');
    await sendEmailVerification(user);
  }
  return isFirebaseEmulatorMode ? 'emulator' : 'email';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('customer');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const authOperationInProgress = useRef(false);

  const logProfileBootstrapFailure = useCallback((stage: 'session' | 'profile', error: unknown) => {
    if (process.env.NODE_ENV === 'production') return;
    const fallback = stage === 'session' ? 'session-failed' : 'profile-failed';
    const category = getProfileFailureCategory(error, fallback);
    console.warn(`Firebase ${stage} bootstrap failed (category: ${category}).`);
  }, []);

  // Sync token with server session cookie
  const syncServerSession = useCallback(async (fbUser: User | null) => {
    if (fbUser) {
      const idToken = await fbUser.getIdToken(true);
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const error = new Error(data?.error || 'Could not establish a secure session. Please try again.') as Error & { code?: string };
        error.code = data?.code;
        throw error;
      }
      return await response.json() as { success: boolean; user: { uid: string; email: string | null; role: UserRole } };
    } else {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not end the server session. Please try again.');
    }
  }, []);

  const establishSession = useCallback(async (fbUser: User) => {
    try {
      await syncServerSession(fbUser);
    } catch (error) {
      setUser(null);
      setFirebaseUser(null);
      setRole('customer');
      await signOut(auth);
      throw error;
    }
  }, [syncServerSession]);

  // Fetch or create Firestore user profile
  const fetchUserProfile = useCallback(async (fbUser: User): Promise<UserProfile> => {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw Object.assign(new Error('The authenticated user profile was not initialized.'), {
        code: 'profile-missing',
      });
    }

    const data = userDoc.data() as UserProfile;
    return {
      ...data,
      uid: fbUser.uid,
      email: fbUser.email || data.email,
      displayName: data.displayName || fbUser.displayName || 'Customer',
      photoURL: fbUser.photoURL || data.photoURL || null,
      role: data.role || 'customer',
      status: data.status || 'active',
    };
  }, []);

  // The verified session route is the sole profile-bootstrap authority. It
  // verifies the token and creates a missing profile with the Admin SDK before
  // the client reads it. Concurrent callers for the same UID share this work.
  const loadAuthenticatedProfile = useMemo(() => createProfileBootstrapLoader(
    async (fbUser: User) => {
      try {
        await establishSession(fbUser);
      } catch (error) {
        logProfileBootstrapFailure('session', error);
        if ((error as { code?: string })?.code === 'auth/email-not-verified') throw error;
        throw Object.assign(new Error('Could not establish a secure session.'), {
          code: 'auth/session-creation-failed',
          failureCategory: getProfileFailureCategory(error, 'session-failed'),
        });
      }
    },
    async (fbUser: User) => {
      try {
        return await fetchUserProfile(fbUser);
      } catch (error) {
        logProfileBootstrapFailure('profile', error);
        throw Object.assign(new Error('Could not load the authenticated user profile.'), {
          code: 'auth/profile-initialization-failed',
          failureCategory: getProfileFailureCategory(error, 'profile-failed'),
        });
      }
    },
  ), [establishSession, fetchUserProfile, logProfileBootstrapFailure]);

  // Listen to Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (authOperationInProgress.current) return;
      setIsLoading(true);
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          // The server enforces email verification and bootstraps missing
          // profiles before this client performs its read.
          const profile = await loadAuthenticatedProfile(fbUser);
          setUser(profile);
          setRole(profile.role);
        } catch {
          // Keep authentication failures out of the Next error overlay. Only a
          // safe category is logged by the bootstrap callbacks above.
          setUser(null);
          setFirebaseUser(null);
          setRole('customer');
          try {
            await signOut(auth);
            await syncServerSession(null);
          } catch (clearError) {
            logProfileBootstrapFailure('session', clearError);
          }
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole('customer');
        try {
          await syncServerSession(null);
        } catch (error) {
            logProfileBootstrapFailure('session', error);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [loadAuthenticatedProfile, logProfileBootstrapFailure, syncServerSession]);

  const loginWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    authOperationInProgress.current = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        try {
          const profile = await loadAuthenticatedProfile(cred.user);
          if (profile.role !== 'admin') {
            throw Object.assign(new Error('Verify your email before signing in.'), { code: 'auth/email-not-verified' });
          }
          setUser(profile);
          setFirebaseUser(cred.user);
          setRole('admin');
          return 'admin';
        } catch (cause) {
          const code = (cause as { code?: string })?.code;
          await signOut(auth);
          try { await syncServerSession(null); } catch (clearError) {
            console.error('Unable to clear rejected login session:', clearError);
          }
          if (code === 'auth/email-not-verified') {
            let verificationDelivery: VerificationDelivery = 'failed';
            try {
              verificationDelivery = await sendVerificationEmail(cred.user);
            } catch (emailError) {
              console.error('Unable to send verification email:', emailError);
            }
            const error = new Error(
              `Your email is not verified yet. ${getVerificationDeliveryMessage(verificationDelivery)}`
            ) as Error & { code: string; verificationDelivery: VerificationDelivery };
            error.code = 'auth/email-not-verified';
            error.verificationDelivery = verificationDelivery;
            throw error;
          }
          const error = new Error('Your credentials are valid, but we could not establish your secure session. Please try again.') as Error & { code: string; cause?: unknown };
          error.code = 'auth/session-creation-failed';
          error.cause = cause;
          throw error;
        }
      }
      let profile: UserProfile;
      try {
        profile = await loadAuthenticatedProfile(cred.user);
      } catch (cause) {
        await signOut(auth).catch(() => undefined);
        await syncServerSession(null).catch((error: unknown) => logProfileBootstrapFailure('session', error));
        const sessionFailure = (cause as { code?: string })?.code === 'auth/session-creation-failed';
        const error = new Error(sessionFailure
          ? 'Your credentials are valid, but we could not establish your secure session. Please try again.'
          : 'Your credentials are valid, but we could not load your user profile. Please try again.') as Error & { code: string };
        error.code = sessionFailure ? 'auth/session-creation-failed' : 'auth/profile-initialization-failed';
        throw error;
      }
      setUser(profile);
      setRole(profile.role);
      return profile.role;
    } finally {
      authOperationInProgress.current = false;
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    displayName: string
  ): Promise<{ verificationDelivery: VerificationDelivery; profileSaved: boolean }> => {
    setIsLoading(true);
    authOperationInProgress.current = true;
    try {
      // This is the only step that determines whether registration itself failed.
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      // Follow-up operations can fail after Firebase has permanently created the account.
      // Report those outcomes separately so the UI never suggests the account is absent.
      let profileSaved = true;
      try {
        await updateProfile(cred.user, { displayName });
      } catch (error) {
        profileSaved = false;
        console.error('Account created, but the Firebase display name could not be saved:', error);
      }

      let verificationDelivery: VerificationDelivery = 'failed';
      try {
        verificationDelivery = await sendVerificationEmail(cred.user);
      } catch (error) {
        console.error('Account created, but the verification email could not be sent:', error);
      }

      setUser(null);
      setFirebaseUser(null);
      setRole('customer');
      try {
        await signOut(auth);
      } catch (error) {
        // The account and verification result are still valid; onAuthStateChanged
        // will reconcile local state if sign-out cannot complete immediately.
        console.error('Account created, but the temporary registration session could not be cleared:', error);
      }

      return { verificationDelivery, profileSaved };
    } finally {
      authOperationInProgress.current = false;
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    authOperationInProgress.current = true;
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      let profile: UserProfile;
      try {
        profile = await loadAuthenticatedProfile(cred.user);
      } catch (cause) {
        await signOut(auth).catch(() => undefined);
        await syncServerSession(null).catch((error: unknown) => logProfileBootstrapFailure('session', error));
        const sessionFailure = (cause as { code?: string })?.code === 'auth/session-creation-failed';
        const error = new Error(sessionFailure
          ? 'Google sign-in succeeded, but we could not establish your secure session. Please try again.'
          : 'Google sign-in succeeded, but we could not load your user profile. Please try again.') as Error & { code: string; cause?: unknown };
        error.code = sessionFailure ? 'auth/session-creation-failed' : 'auth/profile-initialization-failed';
        error.cause = getProfileFailureCategory(cause, 'profile-failed');
        throw error;
      }
      setUser(profile);
      setRole(profile.role);
      return profile.role;
    } finally {
      authOperationInProgress.current = false;
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
      setRole('customer');
      await syncServerSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim(), getActionCodeSettings('/login'));
  };

  const resendVerificationEmail = async (email: string, password: string): Promise<VerificationDelivery> => {
    authOperationInProgress.current = true;
    let signedInForResend = false;
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      signedInForResend = true;
      if (credential.user.emailVerified) {
        throw Object.assign(new Error('This email is already verified. You can sign in now.'), {
          code: 'auth/email-already-verified',
        });
      }
      return await sendVerificationEmail(credential.user);
    } finally {
      try {
        if (signedInForResend && auth.currentUser) await signOut(auth);
      } finally {
        authOperationInProgress.current = false;
      }
    }
  };

  const refreshSession = async () => {
    if (firebaseUser) {
      const profile = await loadAuthenticatedProfile(firebaseUser);
      setUser(profile);
      setRole(profile.role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        role,
        isLoading,
        isAuthenticated: !!user,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        resetPassword,
        resendVerificationEmail,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
