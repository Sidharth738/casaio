export type NotificationType = 'order' | 'payment' | 'seller_application' | 'stock_alert' | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  read: boolean;
  createdAt: string;
}
