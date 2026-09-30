'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
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

  // Sync token with server session cookie
  const syncServerSession = useCallback(async (fbUser: User | null) => {
    try {
      if (fbUser) {
        const idToken = await fbUser.getIdToken(true);
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      } else {
        await fetch('/api/auth/logout', { method: 'POST' });
      }
    } catch (err) {
      console.error('Error syncing server session:', err);
    }
  }, []);

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
        photoURL: fbUser.photoURL || data.photoURL,
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
      photoURL: fbUser.photoURL || undefined,
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
        setFirebaseUser(fbUser);
        try {
          const profile = await fetchUserProfile(fbUser);
          setUser(profile);
          setRole(profile.role);
          await syncServerSession(fbUser);
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUser(null);
          setRole('customer');
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole('customer');
        await syncServerSession(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile, syncServerSession]);

  const loginWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const profile = await fetchUserProfile(cred.user);
      setUser(profile);
      setRole(profile.role);
      await syncServerSession(cred.user);
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string) => {
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName });

      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid: cred.user.uid,
        email,
        displayName,
        role: 'customer',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUser(profile);
      setRole('customer');
      await syncServerSession(cred.user);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const profile = await fetchUserProfile(cred.user);
      setUser(profile);
      setRole(profile.role);
      await syncServerSession(cred.user);
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
