'use client';

import React, { useEffect, useState } from 'react';
import { Plus, MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { UserAddress } from '@/types';
import {
  getUserAddresses,
  saveUserAddress,
  deleteUserAddress,
  setDefaultUserAddress,
} from '@/lib/firebase/firestore';
import { AddressCard } from '@/components/address/AddressCard';
import { AddressForm } from '@/components/address/AddressForm';
import { Button } from '@/components/ui/Button';

export default function CustomerAddressesPage() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getUserAddresses(user.uid)
      .then((data) => {
        if (isMounted) setAddresses(data);
      })
      .catch(() => {
        if (isMounted) setError('Unable to load addresses at this time.');
      })
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const refreshAddresses = async () => {
    if (!user) return;
    try {
      const data = await getUserAddresses(user.uid);
      setAddresses(data);
    } catch {
      setError('Unable to load addresses at this time.');
    }
  };

  const handleSave = async (data: Omit<UserAddress, 'id' | 'userId' | 'createdAt'>) => {
    if (!user) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await saveUserAddress(user.uid, data, editingAddress ? editingAddress.id : undefined);
      setIsAddingNew(false);
      setEditingAddress(null);
      await refreshAddresses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save address.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await deleteUserAddress(addressId);
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
    } catch {
      setError('Failed to delete address.');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!user) return;
    try {
      await setDefaultUserAddress(user.uid, addressId);
      setAddresses((prev) =>
        prev.map((a) => ({
          ...a,
          isDefault: a.id === addressId,
        }))
      );
    } catch {
      setError('Failed to set default address.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Saved Addresses</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Manage your residential and work shipping locations for seamless checkout.
          </p>
        </div>

        {!isAddingNew && !editingAddress && (
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingAddress(null);
              setIsAddingNew(true);
            }}
          >
            Add New Address
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Add or Edit Form Modal / Inline Box */}
      {(isAddingNew || editingAddress) && (
        <div className="rounded-xl border border-zinc-900/10 bg-zinc-50/50 p-6 shadow-xs">
          <div className="mb-4 pb-3 border-b border-zinc-200/80 flex items-center justify-between">
            <h3 className="font-serif font-bold text-base text-zinc-900">
              {editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
            </h3>
            <button
              onClick={() => {
                setIsAddingNew(false);
                setEditingAddress(null);
              }}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>

          <AddressForm
            initialData={editingAddress}
            onSubmit={handleSave}
            onCancel={() => {
              setIsAddingNew(false);
              setEditingAddress(null);
            }}
            isLoading={isSubmitting}
          />
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p className="text-xs">Loading addresses...</p>
        </div>
      ) : addresses.length === 0 && !isAddingNew && !editingAddress ? (
        /* Empty State */
        <div className="py-16 text-center border-2 border-dashed border-zinc-200 rounded-xl p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Saved Addresses</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Add your primary residence or work address to enable one-click delivery for your Casaio orders.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddingNew(true)}
          >
            Add Address
          </Button>
        </div>
      ) : (
        /* Address Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={(addr) => {
                setIsAddingNew(false);
                setEditingAddress(addr);
              }}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}
    </div>
  );
}
