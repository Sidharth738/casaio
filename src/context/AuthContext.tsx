'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { UserProfile, UserRole } from '@/types/user';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: User | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<UserRole>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<{ verificationEmailSent: boolean; profileSaved: boolean }>;
  loginWithGoogle: () => Promise<UserRole>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('customer');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const emailLoginInProgress = useRef(false);

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

    if (userDoc.exists()) {
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
    }

    // Initialize new profile document
    const now = new Date().toISOString();
    const newProfile: UserProfile = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Customer',
      photoURL: fbUser.photoURL || null,
      role: 'customer',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(userDocRef, newProfile);
    return newProfile;
  }, []);

  // Listen to Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsLoading(true);
      if (fbUser) {
        const isUnverifiedPasswordUser =
          !fbUser.emailVerified && fbUser.providerData.some((provider) => provider.providerId === 'password');
        if (isUnverifiedPasswordUser && emailLoginInProgress.current) {
          // The login action is checking this account against its trusted
          // server-side profile; avoid racing it by signing out here.
          setIsLoading(false);
          return;
        }
        setFirebaseUser(fbUser);
        try {
          // The server decides whether an unverified password user has an
          // existing admin profile. This also establishes the session cookie.
          if (isUnverifiedPasswordUser) await syncServerSession(fbUser);
          const profile = await fetchUserProfile(fbUser);
          setUser(profile);
          setRole(profile.role);
          if (!isUnverifiedPasswordUser) await syncServerSession(fbUser);
        } catch (error) {
          // Session service configuration/network failures are recoverable and
          // should be shown by the login form, not promoted to Next's error overlay.
          console.warn('Unable to initialize the signed-in session:', error);
          setUser(null);
          setFirebaseUser(null);
          setRole('customer');
          try {
            await signOut(auth);
            await syncServerSession(null);
          } catch (clearError) {
            console.error('Unable to clear rejected authentication state:', clearError);
          }
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole('customer');
        try {
          await syncServerSession(null);
        } catch (error) {
          console.error('Error clearing server session:', error);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile, syncServerSession]);

  const loginWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    emailLoginInProgress.current = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        try {
          const session = await syncServerSession(cred.user);
          const profile = await fetchUserProfile(cred.user);
          if (session?.user.role !== 'admin' || profile.role !== 'admin') {
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
            try {
              await sendEmailVerification(cred.user, {
                url: `${window.location.origin}/login?verified=1`,
                handleCodeInApp: false,
              });
            } catch (emailError) {
              console.error('Unable to send verification email:', emailError);
            }
            const error = new Error('Please verify your email. We sent you a fresh verification link.') as Error & { code: string };
            error.code = 'auth/email-not-verified';
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
        profile = await fetchUserProfile(cred.user);
      } catch (cause) {
        const error = new Error('Your credentials are valid, but we could not load your user profile. Please try again.') as Error & { code: string; cause?: unknown };
        error.code = 'auth/profile-initialization-failed';
        error.cause = cause;
        throw error;
      }
      setUser(profile);
      setRole(profile.role);
      try {
        await establishSession(cred.user);
      } catch (cause) {
        const error = new Error('Your credentials are valid, but we could not establish your secure session. Please try again.') as Error & { code: string; cause?: unknown };
        error.code = 'auth/session-creation-failed';
        error.cause = cause;
        throw error;
      }
      return profile.role;
    } finally {
      emailLoginInProgress.current = false;
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    displayName: string
  ): Promise<{ verificationEmailSent: boolean; profileSaved: boolean }> => {
    setIsLoading(true);
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

      let verificationEmailSent = true;
      try {
        await sendEmailVerification(cred.user, {
          url: `${window.location.origin}/login?verified=1`,
          handleCodeInApp: false,
        });
      } catch (error) {
        verificationEmailSent = false;
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

      return { verificationEmailSent, profileSaved };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      let profile: UserProfile;
      try {
        profile = await fetchUserProfile(cred.user);
      } catch (cause) {
        const error = new Error('Google sign-in succeeded, but we could not load your user profile. Please try again.') as Error & { code: string; cause?: unknown };
        error.code = 'auth/profile-initialization-failed';
        error.cause = cause;
        throw error;
      }
      setUser(profile);
      setRole(profile.role);
      try {
        await establishSession(cred.user);
      } catch (cause) {
        const error = new Error('Google sign-in succeeded, but we could not establish your secure session. Please try again.') as Error & { code: string; cause?: unknown };
        error.code = 'auth/session-creation-failed';
        error.cause = cause;
        throw error;
      }
      return profile.role;
    } finally {
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
    await sendPasswordResetEmail(auth, email);
  };

  const refreshSession = async () => {
    if (firebaseUser) {
      const profile = await fetchUserProfile(firebaseUser);
      setUser(profile);
      setRole(profile.role);
      await syncServerSession(firebaseUser);
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
