'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { DialogContextList } from '@/components/shared/confirm-dialog';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { guardOpenChange } from '@/lib/dialog-busy';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

interface HelmUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  releaseName: string;
  namespace: string;
  currentChart: string;
  onUpgraded?: () => void;
}

export function HelmUpgradeDialog({
  open,
  onOpenChange,
  clusterId,
  releaseName,
  namespace,
  currentChart,
  onUpgraded,
}: HelmUpgradeDialogProps) {
  const [chart, setChart] = useState(currentChart);
  const [values, setValues] = useState('');
  const [reuseValues, setReuseValues] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [loadingValues, setLoadingValues] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Each load gets an id; a response for an older load (a previous open, or
  // another release) is dropped instead of overwriting the field.
  const loadIdRef = useRef(0);
  const wasOpenRef = useRef(false);

  const loadCurrentValues = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setValues('');
    setLoadError(null);
    setLoadingValues(true);
    try {
      const data = await apiClient.get<{ values: Record<string, unknown> }>(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/values?namespace=${encodeURIComponent(namespace)}`
      );
      let text = '';
      if (data.values && Object.keys(data.values).length > 0) {
        // Convert to YAML-like string for display
        const yaml = (await import('js-yaml')).default;
        text = yaml.dump(data.values, { lineWidth: -1 });
      }
      if (loadId !== loadIdRef.current) return;
      setValues(text);
    } catch (err: unknown) {
      if (loadId !== loadIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Upgrading with an empty field here would silently drop the overrides,
      // so the upgrade stays disabled until values load.
      setLoadError(message);
      toast.error(`Failed to load current Helm values: ${message}`);
    } finally {
      if (loadId === loadIdRef.current) setLoadingValues(false);
    }
  }, [clusterId, releaseName, namespace]);

  // Start fresh on every closed → open transition. `upgrading` is not reset:
  // the dialog cannot close mid-upgrade, and clearing it would re-enable the
  // button while the first request is still running.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setChart(currentChart);
      void loadCurrentValues();
    }
    if (!open) loadIdRef.current += 1;
    wasOpenRef.current = open;
  }, [open, currentChart, loadCurrentValues]);

  const handleUpgrade = async () => {
    if (!chart || upgrading || loadingValues || loadError) return;
    setUpgrading(true);
    try {
      await apiClient.post(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/upgrade`,
        {
          chart,
          namespace,
          values: values || undefined,
          reuseValues,
        },
        { timeoutMs: LONG_RUNNING_TIMEOUT_MS },
      );
      toast.success(`Release "${releaseName}" upgraded successfully`);
      onUpgraded?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Upgrade failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(upgrading, onOpenChange)}>
      <DialogContent className="sm:max-w-2xl" busy={upgrading}>
        <DialogHeader>
          <DialogTitle>Upgrade Release: {releaseName}</DialogTitle>
          <DialogDescription>
            Modify values and chart version to upgrade this release.
          </DialogDescription>
        </DialogHeader>

        <DialogContextList entries={{ cluster: clusterId, namespace, release: releaseName, 'current chart': currentChart }} />

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Chart</label>
            <Input
              value={chart}
              onChange={(e) => setChart(e.target.value)}
              placeholder="repo/chart-name"
            />
            <p className="text-xs text-muted-foreground">
              Enter the chart reference (e.g., bitnami/nginx). Use a different version by appending --version flag in chart name.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="reuse-values"
              checked={reuseValues}
              onChange={(e) => setReuseValues(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="reuse-values" className="text-sm">
              Reuse existing values (--reuse-values)
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Values (YAML)</label>
            {loadingValues ? (
              <div className="flex items-center justify-center h-48 rounded-md border bg-muted/30">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center gap-2 h-48 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-center text-sm text-destructive" role="alert">
                <p>Could not load the release&apos;s current values: {loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void loadCurrentValues()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              </div>
            ) : (
              <textarea
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder="# Override values here"
                className="w-full h-64 rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upgrading}>
            Cancel
          </Button>
          <Button onClick={handleUpgrade} disabled={upgrading || !chart || loadingValues || Boolean(loadError)}>
            {upgrading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Upgrading...
              </>
            ) : (
              'Upgrade'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
