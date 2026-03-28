export interface SystemSetting {
  id: string;
  key: string;
  description: string | null;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}
