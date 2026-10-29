import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Get help with Casaio orders and products.',
};

export default function FAQPage() {
  return (
    <Container className="py-12 sm:py-16">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Customer Care</p>
        <h1 className="font-serif text-3xl font-bold text-zinc-950 sm:text-4xl">Frequently Asked Questions</h1>
        <section className="space-y-3 text-sm leading-7 text-zinc-600">
          <h2 className="text-lg font-semibold text-zinc-900">Need help?</h2>
          <p>
            Casaio&apos;s FAQ content is being prepared. For an answer about a specific order or product,
            please use the <Link className="font-semibold text-orange-700 underline" href="/contact">contact page</Link>.
          </p>
          <p>
            To check an existing order, visit <Link className="font-semibold text-orange-700 underline" href="/track-order">Track Order</Link>.
          </p>
        </section>
      </article>
    </Container>
  );
}
