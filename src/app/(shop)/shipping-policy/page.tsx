import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = {
  title: 'Shipping & Delivery',
  description: 'Shipping information currently published by Casaio.',
};

export default function ShippingPolicyPage() {
  return (
    <Container className="py-12 sm:py-16">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Customer Experience</p>
        <h1 className="font-serif text-3xl font-bold text-zinc-950 sm:text-4xl">Shipping &amp; Delivery</h1>
        <section className="space-y-3 text-sm leading-7 text-zinc-600">
          <h2 className="text-lg font-semibold text-zinc-900">Current shipping information</h2>
          <p>
            Casaio currently advertises complimentary shipping on every order. The storefront does not
            publish delivery-time estimates or international shipping terms. Please confirm availability
            and timing for your destination with Casaio before ordering if you need those details.
          </p>
          <p>
            For an order already placed, sign in and review its status and tracking details on your{' '}
            <Link className="font-semibold text-orange-700 underline" href="/account/orders">orders page</Link>.
          </p>
        </section>
        <p className="border-t border-zinc-200 pt-5 text-xs leading-6 text-zinc-500">
          This page records the shipping information currently available on the storefront. It does not
          add delivery promises or customs terms that Casaio has not published.
        </p>
      </article>
    </Container>
  );
}
