import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = {
  title: 'Returns & Refunds',
  description: 'Returns and refund information currently published by Casaio.',
};

export default function ReturnsRefundsPage() {
  return (
    <Container className="py-12 sm:py-16">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Customer Experience</p>
        <h1 className="font-serif text-3xl font-bold text-zinc-950 sm:text-4xl">Returns &amp; Refunds</h1>
        <section className="space-y-3 text-sm leading-7 text-zinc-600">
          <h2 className="text-lg font-semibold text-zinc-900">Policy details are being completed</h2>
          <p>
            Casaio&apos;s current storefront messaging advertises a seven-day returns window and a
            replacement or refund for damaged or incorrect items. Complete eligibility, return-shipping,
            exchange and refund-timing terms are not published here yet.
          </p>
          <p>
            Please contact Casaio for instructions before sending an item back. Use the{' '}
            <Link className="font-semibold text-orange-700 underline" href="/contact">contact page</Link>.
          </p>
        </section>
        <p className="border-t border-zinc-200 pt-5 text-xs leading-6 text-zinc-500">
          This notice summarizes existing storefront messaging; it does not add or replace eligibility
          terms or any rights that apply under local law.
        </p>
      </article>
    </Container>
  );
}
