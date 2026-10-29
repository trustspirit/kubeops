import { BottomPanel } from '@/components/panel/bottom-panel';

/**
 * Shared by every cluster route, so the bottom panel (exec shells, log
 * streams) survives switching clusters or returning to the cluster list —
 * the per-cluster layout remounts whenever `[clusterId]` changes.
 *
 * The panel sits above the per-cluster WatchProvider on purpose: its tabs may
 * belong to any cluster, so they poll rather than borrow the current page's
 * Watch connection.
 */
export default function ClustersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <BottomPanel />
    </div>
  );
}
