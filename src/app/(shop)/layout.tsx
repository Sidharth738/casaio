import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { StoreHeader } from '@/components/layout/StoreHeader';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <StoreHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
