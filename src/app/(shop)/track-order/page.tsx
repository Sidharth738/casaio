import { redirect } from 'next/navigation';

/** Keep the public tracking URL as an alias to the authenticated order history. */
export default function TrackOrderPage() {
  redirect('/account/orders');
}
