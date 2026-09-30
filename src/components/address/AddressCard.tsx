'use client';

import React from 'react';
import { Home, Briefcase, MapPin, Check, Trash2, Edit2 } from 'lucide-react';
import type { UserAddress } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface AddressCardProps {
  address: UserAddress;
  isSelected?: boolean;
  onSelect?: (address: UserAddress) => void;
  onEdit?: (address: UserAddress) => void;
  onDelete?: (addressId: string) => void;
  onSetDefault?: (addressId: string) => void;
  isSelectable?: boolean;
}

export const AddressCard: React.FC<AddressCardProps> = ({
  address,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onSetDefault,
  isSelectable = false,
}) => {
  const getIcon = () => {
    switch (address.addressType) {
      case 'home':
        return <Home className="w-3.5 h-3.5" />;
      case 'work':
        return <Briefcase className="w-3.5 h-3.5" />;
      default:
        return <MapPin className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      onClick={() => isSelectable && onSelect && onSelect(address)}
      className={`relative rounded-xl border p-5 transition-all flex flex-col justify-between ${
        isSelectable ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'border-zinc-950 bg-zinc-50/50 shadow-sm ring-2 ring-zinc-950/5'
          : 'border-zinc-200/90 bg-white hover:border-zinc-300 shadow-xs'
      }`}
    >
      <div>
        {/* Top Badges & Type */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 capitalize">
              {getIcon()}
              {address.addressType}
            </span>
            {address.isDefault && (
              <Badge variant="accent" size="sm">
                Default
              </Badge>
            )}
          </div>

          {isSelectable && (
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                isSelected
                  ? 'border-zinc-950 bg-zinc-950 text-white'
                  : 'border-zinc-300 bg-white text-transparent'
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}
        </div>

        {/* Recipient Details */}
        <h4 className="font-serif font-bold text-base text-zinc-900 mb-1">
          {address.fullName}
        </h4>
        <p className="text-xs text-zinc-500 font-mono mb-2.5">
          +91 {address.phoneNumber}
          {address.alternatePhone && ` • Alt: +91 ${address.alternatePhone}`}
        </p>

        {/* Address Lines */}
        <p className="text-xs text-zinc-700 leading-relaxed">
          {address.addressLine1}
          {address.addressLine2 && `, ${address.addressLine2}`}
        </p>
        {address.landmark && (
          <p className="text-xs text-zinc-500 mt-0.5 italic">
            Landmark: {address.landmark}
          </p>
        )}
        <p className="text-xs font-medium text-zinc-800 mt-1">
          {address.city}, {address.state} — {address.postalCode}
        </p>
      </div>

      {/* Action Footer */}
      {(onEdit || onDelete || onSetDefault) && (
        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
          <div>
            {!address.isDefault && onSetDefault && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDefault(address.id);
                }}
                className="text-zinc-500 hover:text-zinc-950 font-medium underline underline-offset-2 transition-colors"
              >
                Set as Default
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-zinc-600 hover:text-zinc-950"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(address);
                }}
                leftIcon={<Edit2 className="w-3 h-3" />}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(address.id);
                }}
                leftIcon={<Trash2 className="w-3 h-3" />}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
