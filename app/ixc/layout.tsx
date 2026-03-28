export const metadata = {
  title: 'Admin Control Panel',
  robots: 'noindex, nofollow'
};

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}







