'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { User, Mail, Phone, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function ProfilePage() {
  const { user, role, refreshSession } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        updatedAt: new Date().toISOString(),
      });

      await refreshSession();
      setSuccessMessage('Profile information saved successfully.');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Personal Profile</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Manage your account contact details and authorization credentials.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-md border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Account Verification & Role Card */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-orange-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">Platform Role</span>
              <Badge variant="accent" size="sm">
                {role}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Account status is active & verified for retail transactions.
            </p>
          </div>
        </div>

        {user?.createdAt && (
          <div className="text-left sm:text-right">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Member Since</span>
            <span className="text-xs font-medium text-zinc-700">{formatDate(user.createdAt)}</span>
          </div>
        )}
      </div>

      {/* Edit Profile Form */}
      <form onSubmit={handleProfileUpdate} className="space-y-5 max-w-xl">
        <Input
          label="Full Name"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          leftIcon={<User className="w-4 h-4" />}
        />

        <Input
          label="Email Address"
          type="email"
          disabled
          value={user?.email || ''}
          helperText="Email cannot be changed directly for security reasons."
          leftIcon={<Mail className="w-4 h-4" />}
        />

        <Input
          label="Phone Number"
          type="tel"
          placeholder="+91 98765 43210"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          helperText="Used for shipment notifications and courier delivery verification."
          leftIcon={<Phone className="w-4 h-4" />}
        />

        <div className="pt-2">
          <Button type="submit" variant="primary" size="md" isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
