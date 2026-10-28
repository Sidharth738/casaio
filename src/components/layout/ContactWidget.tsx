'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, Mail, MessageCircle, Send, X } from 'lucide-react';

const CONTACT_EMAIL = 'casaio.official@gmail.com';
const INSTAGRAM_URL = 'https://www.instagram.com/casaio.official/';
const GMAIL_COMPOSE_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CONTACT_EMAIL)}`;

export function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isOverFooter, setIsOverFooter] = useState(false);
  const floatingButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let frame: number | null = null;

    const updateSurface = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const button = floatingButtonRef.current;
        const footer = document.querySelector<HTMLElement>('[data-site-footer]');
        if (!button || !footer) return;

        const buttonRect = button.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const overlapsFooter = buttonRect.bottom > footerRect.top && buttonRect.top < footerRect.bottom;
        setIsOverFooter(overlapsFooter);
      });
    };

    updateSurface();
    window.addEventListener('scroll', updateSurface, { passive: true });
    window.addEventListener('resize', updateSurface);

    return () => {
      window.removeEventListener('scroll', updateSurface);
      window.removeEventListener('resize', updateSurface);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();
    setStatus('sending');
    setError('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const result = await response.json() as { error?: string };

      if (!response.ok) throw new Error(result.error || 'Unable to send your message.');

      form.reset();
      setStatus('sent');
    } catch (submitError) {
      setStatus('error');
      setError(submitError instanceof Error ? submitError.message : 'Unable to send your message.');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div id="casaio-contact-panel" role="dialog" aria-labelledby="casaio-contact-title" className="mb-3 w-[min(calc(100vw-2rem),24rem)] rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="casaio-contact-title" className="text-lg font-semibold">Contact Casaio</h2>
              <p className="mt-1 text-sm text-zinc-500">We&apos;re happy to help with your order or product questions.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close contact form" className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <label htmlFor="contact-name" className="sr-only">Your name</label>
            <input id="contact-name" name="name" placeholder="Your name" autoComplete="name" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-500" />
            <label htmlFor="contact-email" className="sr-only">Your email</label>
            <input id="contact-email" name="email" type="email" required placeholder="Your email" autoComplete="email" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-500" />
            <label htmlFor="contact-message" className="sr-only">How can we help?</label>
            <textarea id="contact-message" name="message" required rows={4} placeholder="How can we help?" className="w-full resize-none border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-500" />
            <button type="submit" disabled={status === 'sending'} className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"><Send size={16} /> {status === 'sending' ? 'Sending…' : 'Send message'}</button>
            {status === 'sent' && <p role="status" className="text-sm text-green-600">Your message was sent to Casaio.</p>}
            {status === 'error' && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </form>
          <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-4">
            <a href={GMAIL_COMPOSE_URL} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium hover:border-orange-500 hover:text-orange-600"><Mail size={14} /> Email</a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium hover:border-orange-500 hover:text-orange-600"><Camera size={14} /> Instagram</a>
          </div>
        </div>
      )}
      <button
        ref={floatingButtonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="casaio-contact-panel"
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold shadow-xl transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
          isOverFooter
            ? 'border-white bg-white text-zinc-950 hover:bg-zinc-100'
            : 'border-zinc-950 bg-zinc-950 text-white hover:bg-orange-600'
        }`}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />} Contact Us
      </button>
    </div>
  );
}
