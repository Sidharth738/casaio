export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface SellerProfile {
  id: string; // Matches user.uid
  storeName: string;
  storeSlug: string;
  storeEmail: string;
  storePhone: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  status: SellerStatus;
  statusReason?: string;
  businessAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  payoutDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    upiId?: string;
  };
  commissionRatePercent: number;
  metrics: {
    totalSalesAmount: number;
    totalOrdersCount: number;
    ratingAverage: number;
    ratingCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SellerApplicationInput {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  description: string;
  businessAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  payoutDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    upiId?: string;
  };
}
