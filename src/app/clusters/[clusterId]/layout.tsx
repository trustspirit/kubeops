import { AppShell } from '@/components/layout/app-shell';

export default function ClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
