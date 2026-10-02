import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines Tailwind CSS classes with clsx and twMerge to avoid class conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Resolves supported image links and rejects page URLs that Next Image cannot render. */
export function getRenderableImageUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;

    if (url.hostname === 'unsplash.com' && url.pathname.includes('KSfe2Z4REEM')) {
      return 'https://images.unsplash.com/photo-1615873968403-89e068629265?auto=format&fit=crop&w=1200&q=80';
    }

    if (!['images.unsplash.com', 'firebasestorage.googleapis.com'].includes(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Formats a numeric amount to Indian Rupee (INR) currency format (e.g. ₹1,299).
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formats ISO date or timestamp to a clean user-friendly string.
 */
export function formatDate(dateInput: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Formats date with time.
 */
export function formatDateTime(dateInput: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Converts a text string into an SEO-friendly URL slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
}

/**
 * Truncates long text gracefully.
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Generates a clean human-readable order number (e.g. CAS-2026-89412).
 */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  return `CAS-${year}-${randomSuffix}`;
}
