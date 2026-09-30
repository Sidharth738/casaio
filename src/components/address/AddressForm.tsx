'use client';

import React, { useState } from 'react';
import type { UserAddress } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Home, Briefcase, MapPin, Check } from 'lucide-react';

interface AddressFormProps {
  initialData?: UserAddress | null;
  onSubmit: (data: Omit<UserAddress, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const AddressForm: React.FC<AddressFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState({
    fullName: initialData?.fullName || '',
    phoneNumber: initialData?.phoneNumber || '',
    alternatePhone: initialData?.alternatePhone || '',
    addressLine1: initialData?.addressLine1 || '',
    addressLine2: initialData?.addressLine2 || '',
    landmark: initialData?.landmark || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    postalCode: initialData?.postalCode || '',
    country: initialData?.country || 'India',
    addressType: initialData?.addressType || ('home' as 'home' | 'work' | 'other'),
    isDefault: initialData?.isDefault ?? false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    } else if (!/^[6-9]\d{9}$/.test(formData.phoneNumber.trim())) {
      newErrors.phoneNumber = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'House/flat and street are required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Postal code is required';
    } else if (!/^\d{6}$/.test(formData.postalCode.trim())) {
      newErrors.postalCode = 'Enter a valid 6-digit PIN code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full Name *"
          placeholder="e.g. Siddharth Verma"
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          error={errors.fullName}
          required
        />
        <Input
          label="10-digit Mobile Number *"
          placeholder="e.g. 9876543210"
          value={formData.phoneNumber}
          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
          error={errors.phoneNumber}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Alternate Phone (Optional)"
          placeholder="e.g. 9811223344"
          value={formData.alternatePhone}
          onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
        />
        <Input
          label="Landmark (Optional)"
          placeholder="e.g. Near Indiranagar Metro"
          value={formData.landmark}
          onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
        />
      </div>

      <Input
        label="Flat, House no., Building, Company, Apartment *"
        placeholder="e.g. Villa 14, Whispering Palms, 12th Main"
        value={formData.addressLine1}
        onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
        error={errors.addressLine1}
        required
      />

      <Input
        label="Area, Street, Sector, Village"
        placeholder="e.g. HAL 2nd Stage, Indiranagar"
        value={formData.addressLine2}
        onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Town / City *"
          placeholder="e.g. Bengaluru"
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          error={errors.city}
          required
        />
        <Input
          label="State *"
          placeholder="e.g. Karnataka"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          error={errors.state}
          required
        />
        <Input
          label="PIN Code *"
          placeholder="e.g. 560038"
          value={formData.postalCode}
          onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
          error={errors.postalCode}
          required
        />
      </div>

      {/* Address Type */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-2">Address Type</label>
        <div className="flex items-center gap-3">
          {(['home', 'work', 'other'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFormData({ ...formData, addressType: type })}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                formData.addressType === type
                  ? 'border-zinc-950 bg-zinc-950 text-white shadow-xs'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
              }`}
            >
              {type === 'home' && <Home className="w-3.5 h-3.5" />}
              {type === 'work' && <Briefcase className="w-3.5 h-3.5" />}
              {type === 'other' && <MapPin className="w-3.5 h-3.5" />}
              <span className="capitalize">{type}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Default Checkbox */}
      <div className="pt-2">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formData.isDefault}
            onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            className="w-4 h-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
          />
          <span className="text-xs text-zinc-700 font-medium">
            Use as my default delivery address
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-100">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={isLoading}
          isLoading={isLoading}
          rightIcon={!isLoading ? <Check className="w-4 h-4" /> : undefined}
        >
          {initialData ? 'Update Address' : 'Save Address'}
        </Button>
      </div>
    </form>
  );
};
