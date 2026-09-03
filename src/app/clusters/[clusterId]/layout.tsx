import { AppShell } from '@/components/layout/app-shell';
import { WatchProvider } from '@/providers/watch-provider';
import { ClusterAuthGuard } from '@/components/clusters/cluster-auth-guard';

export default function ClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WatchProvider>
      <AppShell>
        <ClusterAuthGuard>{children}</ClusterAuthGuard>
      </AppShell>
    </WatchProvider>
  );
}
