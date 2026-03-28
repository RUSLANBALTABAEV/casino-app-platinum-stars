export interface StatusPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tier: 'STANDARD' | 'PREMIUM';
  price: number;
  currency: string;
  durationDays: number | null;
  benefits: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
