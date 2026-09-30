'use client';

import React, { useEffect, useState } from 'react';
import {
  Store,
  MapPin,
  CreditCard,
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { SellerProfile } from '@/types';
import { getSellerProfile } from '@/lib/firebase/firestore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export default function SellerProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [isFetched, setIsFetched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [storeName, setStoreName] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [description, setDescription] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getSellerProfile(user.uid)
      .then((data) => {
        if (isMounted && data) {
          setProfile(data);
          setStoreName(data.storeName || '');
          setStoreEmail(data.storeEmail || '');
          setStorePhone(data.storePhone || '');
          setDescription(data.description || '');
          setStreet(data.businessAddress?.street || '');
          setCity(data.businessAddress?.city || '');
          setState(data.businessAddress?.state || '');
          setPostalCode(data.businessAddress?.postalCode || '');
          setAccountHolderName(data.payoutDetails?.accountHolderName || '');
          setAccountNumber(data.payoutDetails?.accountNumber || '');
          setIfscCode(data.payoutDetails?.ifscCode || '');
          setUpiId(data.payoutDetails?.upiId || '');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const sellerRef = doc(db, 'sellers', user.uid);
      const updated = {
        storeName,
        storeEmail,
        storePhone,
        description,
        businessAddress: {
          street,
          city,
          state,
          postalCode,
          country: 'India',
        },
        payoutDetails: {
          accountHolderName,
          accountNumber,
          ifscCode,
          upiId,
        },
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(sellerRef, updated);
      setSuccess('Store profile and payout details saved successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update store profile';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
        <p className="text-xs">Loading store profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Atelier Profile & Payouts
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Manage your brand identity, dispatch factory location, and verified bank payout coordinates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="accent" size="sm" className="capitalize">
            {profile?.status || 'Active'} Store
          </Badge>
          <span className="text-xs text-zinc-400 font-mono">
            {profile?.commissionRatePercent || 10}% Commission
          </span>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-8">
        {/* 1. Brand Information */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <Store className="w-4 h-4 text-zinc-700" />
            <h3 className="font-serif font-bold text-base text-zinc-950">
              Brand & Atelier Identity
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Store / Brand Name *"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
            />
            <Input
              label="Primary Contact Email *"
              type="email"
              value={storeEmail}
              onChange={(e) => setStoreEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Support Phone Number *"
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              required
            />
            <Input
              label="Specialty / Craft Focus"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Handmade ceramic stoneware, Scandinavian fluted oak"
            />
          </div>
        </div>

        {/* 2. Dispatch Workshop Address */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <MapPin className="w-4 h-4 text-zinc-700" />
            <h3 className="font-serif font-bold text-base text-zinc-950">
              Dispatch Workshop & Return Hub
            </h3>
          </div>

          <Input
            label="Street / Industrial Unit Address *"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="City *"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
            <Input
              label="State *"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            />
            <Input
              label="Postal Code *"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              required
            />
          </div>
        </div>

        {/* 3. Bank Payout Coordinates */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-zinc-700" />
              <h3 className="font-serif font-bold text-base text-zinc-950">
                Direct Payout Coordinates
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Encrypted Settlement</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Account Holder Name"
              placeholder="e.g. Nordic Oak Studios Pvt Ltd"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
            <Input
              label="Bank Account Number"
              placeholder="e.g. 50100234567890"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="IFSC Code"
              placeholder="e.g. HDFC0001234"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            />
            <Input
              label="UPI ID for Instant Payouts (Optional)"
              placeholder="nordicoak@okhdfcbank"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t border-zinc-200">
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSaving}
            disabled={isSaving}
            rightIcon={!isSaving ? <Check className="w-4 h-4" /> : undefined}
          >
            Save Profile Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
