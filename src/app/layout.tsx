import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { StoreHeader } from '@/components/layout/StoreHeader';
import { Footer } from '@/components/layout/Footer';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Casaio | Premium Curated Living & Artisan Dropshipping',
  description:
    'Discover curated luxury furniture, architectural lighting, and artisanal home decor directly from certified dropship creators and workshops.',
  keywords: [
    'Casaio',
    'luxury furniture',
    'modern decor',
    'dropshipping',
    'artisan lighting',
    'interior design',
  ],
  authors: [{ name: 'Casaio' }],
  openGraph: {
    title: 'Casaio | Premium Curated Living',
    description: 'Elevate your sanctuary with timeless home furnishings and decor.',
    type: 'website',
    locale: 'en_IN',
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
          <AnnouncementBar />
          <StoreHeader />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
