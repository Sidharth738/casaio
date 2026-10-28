import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { CartProvider } from '@/context/CartContext';
import { JsonLd } from '@/components/seo/JsonLd';
import { absoluteUrl, organizationJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL, websiteJsonLd } from '@/lib/seo';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Casaio | Premium Curated Living & Artisan Dropshipping',
    template: '%s | Casaio',
  },
  description: SITE_DESCRIPTION,
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
  authors: [{ name: SITE_NAME, url: SITE_URL }],
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
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_IN',
    images: [
      {
        url: absoluteUrl('/casaio-logo.png'),
        width: 562,
        height: 562,
        alt: 'Casaio logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Casaio | Premium Curated Living',
    description: 'Elevate your sanctuary with timeless home furnishings and decor.',
    creator: SITE_NAME,
    images: [absoluteUrl('/casaio-logo.png')],
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [{ url: '/casaio-logo.png', type: 'image/png' }],
    apple: '/casaio-logo.png',
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
      <body className="min-h-full flex flex-col bg-[#FBFBF9] text-zinc-900 font-sans selection:bg-orange-100 selection:text-orange-900">
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <JsonLd data={organizationJsonLd} />
              <JsonLd data={websiteJsonLd} />
              {children}
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
