export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: 'STARS' | 'XTR' | 'USD' | 'EUR';
  destination: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT';
  type: 'STARS' | 'NFT_GIFT';
  comment: string | null;
  meta: object | null;
  createdAt: Date;
  processedAt: Date | null;
  processedById: string | null;
}
