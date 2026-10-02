'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Container } from '@/components/ui/Container';
import { Card, CardContent } from '@/components/ui/Card';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Store, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export default function SellerRegisterPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [storeName, setStoreName] = useState('');
  const [storeEmail, setStoreEmail] = useState(user?.email || '');
  const [storePhone, setStorePhone] = useState('');
  const [description, setDescription] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !user) {
      router.push(`/login?redirect=/seller/register`);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const now = new Date().toISOString();
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const sellerDoc = {
        id: user.uid,
        storeName,
        storeSlug: slug,
        storeEmail,
        storePhone,
        description,
        status: 'pending',
        businessAddress: {
          street,
          city,
          state,
          postalCode,
          country: 'India',
        },
        commissionRatePercent: 10,
        metrics: {
          totalSalesAmount: 0,
          totalOrdersCount: 0,
          ratingAverage: 5.0,
          ratingCount: 0,
        },
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'sellers', user.uid), sellerDoc);
      setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to submit seller application.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-12 bg-[#FAFAF8] min-h-[85vh]">
      <Container size="md">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </Link>
        </div>

        <Card className="shadow-lg border-zinc-200">
          <CardContent className="p-8 sm:p-10 space-y-6">
            <div className="text-center max-w-lg mx-auto space-y-2">
              <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center mx-auto border border-orange-200">
                <Store className="w-6 h-6" />
              </div>
              <h1 className="font-serif text-3xl font-bold text-zinc-950">
                Partner with Casaio
              </h1>
              <p className="text-xs text-zinc-500">
                Apply for a verified dropshipping storefront. Gain direct access to our affluent design-conscious customer base nationwide.
              </p>
            </div>

            {isSuccess ? (
              <div className="py-8 text-center space-y-4 animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-zinc-900">Application Submitted</h3>
                  <p className="text-xs text-zinc-600 max-w-md mx-auto mt-1">
                    Your seller application for <strong className="text-zinc-900">{storeName}</strong> has been received with status <span className="font-mono text-orange-700 font-semibold">PENDING APPROVAL</span>. Our onboarding team evaluates applications within 24-48 hours.
                  </p>
                </div>
                <div className="pt-2">
                  <Link href="/account/profile">
                    <Button variant="primary" size="md">
                      Go to Account Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                {error && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {!isAuthenticated && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-900">
                    You must have a Casaio customer account to submit a seller application.{' '}
                    <Link href="/login?redirect=/seller/register" className="font-bold underline">
                      Sign in or create an account
                    </Link>{' '}
                    first.
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider border-b border-zinc-100 pb-2">
                    1. Brand & Atelier Details
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Store / Brand Name"
                      required
                      placeholder="e.g. Nordic Oak Studios"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                    />
                    <Input
                      label="Store Contact Email"
                      type="email"
                      required
                      placeholder="atelier@domain.com"
                      value={storeEmail}
                      onChange={(e) => setStoreEmail(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Contact Phone"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                    />
                    <Input
                      label="Product Specialty"
                      placeholder="e.g. Solid Wood Credenzas, Lighting"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider border-b border-zinc-100 pb-2">
                    2. Workshop & Dispatch Address
                  </h3>

                  <Input
                    label="Street Address / Factory Unit"
                    required
                    placeholder="Unit 4B, Industrial Estate"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="City"
                      required
                      placeholder="Bengaluru"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                    <Input
                      label="State"
                      required
                      placeholder="Karnataka"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                    <Input
                      label="Postal Code"
                      required
                      placeholder="560001"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isLoading}
                  className="w-full"
                >
                  Submit Seller Application
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
