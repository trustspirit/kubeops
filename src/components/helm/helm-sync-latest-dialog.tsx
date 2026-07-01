'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

interface HelmSyncLatestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  releaseName: string;
  namespace: string;
  currentChart: string;
  currentVersion?: string;
  onSynced?: () => void;
}

interface HelmSyncLatestResponse {
  chart: string;
  chartVersion?: string;
  skipped?: boolean;
}

export function HelmSyncLatestDialog({
  open,
  onOpenChange,
  clusterId,
  releaseName,
  namespace,
  currentChart,
  currentVersion,
  onSynced,
}: HelmSyncLatestDialogProps) {
  const [chart, setChart] = useState(currentChart);
  const [reuseValues, setReuseValues] = useState(true);
  const [dependencyUpdate, setDependencyUpdate] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChart(currentChart);
    setReuseValues(true);
    setDependencyUpdate(true);
    setSyncing(false);
  }, [open, currentChart]);

  const handleSync = async () => {
    const chartRef = chart.trim();
    if (!chartRef) return;

    setSyncing(true);
    try {
      const result = await apiClient.post<HelmSyncLatestResponse>(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/sync-latest`,
        {
          chart: chartRef,
          namespace,
          reuseValues,
          dependencyUpdate,
          currentVersion,
        },
      );
      const versionLabel = result.chartVersion ? ` to ${result.chartVersion}` : '';
      toast.success(
        result.skipped
          ? `Release "${releaseName}" is already up to date`
          : `Release "${releaseName}" synced${versionLabel}`,
      );
      onSynced?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const currentChartLabel = [currentChart, currentVersion].filter(Boolean).join('-') || '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Latest Chart</DialogTitle>
          <DialogDescription>
            Upgrade the Helm release to the latest chart version and keep existing values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5">
              <span className="text-muted-foreground">Release</span>
              <span className="font-mono truncate">{releaseName}</span>
              <span className="text-muted-foreground">Namespace</span>
              <span className="font-mono truncate">{namespace}</span>
              <span className="text-muted-foreground">Current chart</span>
              <span className="font-mono truncate">{currentChartLabel}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Chart Reference</label>
            <Input
              value={chart}
              onChange={(event) => setChart(event.target.value)}
              placeholder="repo/chart-name"
            />
            <p className="text-xs text-muted-foreground">
              Sync uses configured Helm repositories. Use the full repo/chart name when more than one repository has the same chart.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reuseValues}
                onChange={(event) => setReuseValues(event.target.checked)}
                className="rounded"
              />
              Reuse existing values
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dependencyUpdate}
                onChange={(event) => setDependencyUpdate(event.target.checked)}
                className="rounded"
              />
              Update missing chart dependencies
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={syncing || !chart.trim()}>
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Sync Latest
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
