export type UserRole = 'customer' | 'seller' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  photoURL?: string | null;
  role: UserRole;
  status: UserStatus;
  defaultShippingAddressId?: string;
  createdAt: string; // ISO string representation for serializable client state
  updatedAt: string;
}

export interface UserAddress {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  alternatePhone?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  addressType: 'home' | 'work' | 'other';
  isDefault: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
  createdAt: string;
}

export interface AuthState {
  user: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
}
