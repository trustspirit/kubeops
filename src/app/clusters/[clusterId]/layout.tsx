import { AppShell } from '@/components/layout/app-shell';
import { WatchProvider } from '@/providers/watch-provider';
import { AlertListener } from '@/components/shared/alert-listener';
import { ClusterAuthGuard } from '@/components/clusters/cluster-auth-guard';

export default function ClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WatchProvider>
      <AlertListener />
      <AppShell>
        <ClusterAuthGuard>{children}</ClusterAuthGuard>
      </AppShell>
    </WatchProvider>
  );
}
