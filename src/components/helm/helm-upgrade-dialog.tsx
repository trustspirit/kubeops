'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    if (open) {
      setChart(currentChart);
      setUpgrading(false);
      loadCurrentValues();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentChart]);

  const loadCurrentValues = async () => {
    setLoadingValues(true);
    try {
      const data = await apiClient.get<{ values: Record<string, any> }>(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/values?namespace=${encodeURIComponent(namespace)}`
      );
      if (data.values && Object.keys(data.values).length > 0) {
        // Convert to YAML-like string for display
        const yaml = (await import('js-yaml')).default;
        setValues(yaml.dump(data.values, { lineWidth: -1 }));
      } else {
        setValues('');
      }
    } catch (err: unknown) {
      console.error('Failed to load current values:', err);
      setValues('');
    } finally {
      setLoadingValues(false);
    }
  };

  const handleUpgrade = async () => {
    if (!chart) return;
    setUpgrading(true);
    try {
      await apiClient.post(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/upgrade`,
        {
          chart,
          namespace,
          values: values || undefined,
          reuseValues,
        }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade Release: {releaseName}</DialogTitle>
          <DialogDescription>
            Modify values and chart version to upgrade this release.
          </DialogDescription>
        </DialogHeader>

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
          <Button onClick={handleUpgrade} disabled={upgrading || !chart}>
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
