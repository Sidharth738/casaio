import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { StoreHeader } from '@/components/layout/StoreHeader';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { ContactWidget } from '@/components/layout/ContactWidget';
import { CurrencyProvider } from '@/context/CurrencyContext';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <AnnouncementBar />
      <StoreHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
      <ContactWidget />
    </CurrencyProvider>
  );
}
