import { z } from 'zod';

const BusinessAddressSchema = z.object({
  street: z.string().min(3).max(200),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postalCode: z.string().min(3).max(20),
  country: z.literal('India'),
}).strict();

const SellerProfileFields = {
  storeName: z.string().min(2).max(100),
  storeEmail: z.string().email().max(254),
  storePhone: z.string().min(7).max(30),
  description: z.string().max(1000),
  businessAddress: BusinessAddressSchema,
  payoutDetails: z.object({
    accountHolderName: z.string().max(120),
    accountNumber: z.string().max(40),
    ifscCode: z.string().max(20),
    upiId: z.string().max(100).optional(),
  }).strict(),
};

export const SellerApplicationSchema = z.object({
  storeName: SellerProfileFields.storeName,
  storeEmail: SellerProfileFields.storeEmail,
  storePhone: SellerProfileFields.storePhone,
  description: SellerProfileFields.description,
  businessAddress: SellerProfileFields.businessAddress,
}).strict();

export const SellerProfileUpdateSchema = z.object({
  storeName: SellerProfileFields.storeName.optional(),
  storeEmail: SellerProfileFields.storeEmail.optional(),
  storePhone: SellerProfileFields.storePhone.optional(),
  description: SellerProfileFields.description.optional(),
  businessAddress: SellerProfileFields.businessAddress.optional(),
  payoutDetails: SellerProfileFields.payoutDetails.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'No seller profile changes provided');
