import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = {
  title: 'Contact Casaio',
  description: 'Contact Casaio about an order or product question.',
};

export default function ContactPage() {
  return (
    <Container className="py-12 sm:py-16">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Customer Care</p>
        <h1 className="font-serif text-3xl font-bold text-zinc-950 sm:text-4xl">Contact Casaio</h1>
        <div className="space-y-3 text-sm leading-7 text-zinc-600">
          <p>For help with an order or product question, use the Contact Us form on this page.</p>
          <p>
            You can also email{' '}
            <a className="font-semibold text-orange-700 underline" href="mailto:casaio.official@gmail.com">
              casaio.official@gmail.com
            </a>{' '}
            or message Casaio on{' '}
            <a className="font-semibold text-orange-700 underline" href="https://www.instagram.com/casaio.official/" target="_blank" rel="noreferrer">
              Instagram
            </a>.
          </p>
        </div>
      </article>
    </Container>
  );
}
