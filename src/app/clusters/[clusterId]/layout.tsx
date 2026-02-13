import { AppShell } from '@/components/layout/app-shell';
import { WatchProvider } from '@/providers/watch-provider';
import { AlertListener } from '@/components/shared/alert-listener';

export default function ClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WatchProvider>
      <AlertListener />
      <AppShell>{children}</AppShell>
    </WatchProvider>
  );
}
