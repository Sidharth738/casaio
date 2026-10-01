import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { CartProvider } from '@/context/CartContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://casaio.app';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Casaio | Premium Curated Living & Artisan Dropshipping',
    template: '%s | Casaio',
  },
  description:
    'Discover curated luxury furniture, architectural lighting, and artisanal home decor directly from certified dropship creators and workshops.',
  keywords: [
    'Casaio',
    'luxury furniture',
    'modern decor',
    'dropshipping',
    'artisan lighting',
    'interior design',
    'home furnishing India',
    'premium homeware',
  ],
  authors: [{ name: 'Casaio', url: BASE_URL }],
  creator: 'Casaio',
  publisher: 'Casaio',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    title: 'Casaio | Premium Curated Living',
    description: 'Elevate your sanctuary with timeless home furnishings and decor.',
    url: BASE_URL,
    siteName: 'Casaio',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Casaio | Premium Curated Living',
    description: 'Elevate your sanctuary with timeless home furnishings and decor.',
    creator: '@casaio',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FBFBF9] text-zinc-900 font-sans selection:bg-amber-100 selection:text-amber-900">
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
