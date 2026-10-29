'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DialogContextList } from '@/components/shared/confirm-dialog';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { guardOpenChange } from '@/lib/dialog-busy';
import { useSettingsStore } from '@/stores/settings-store';
import { toast } from 'sonner';
import { Loader2, RefreshCw, LogIn } from 'lucide-react';

interface ArgoCDSyncChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  appName: string;
  namespace: string;
  chart: string;
  currentVersion?: string;
  onSynced?: () => void;
}

interface CheckResponse {
  chart: string;
  currentRevision: string;
  syncedRevision?: string;
  syncStatus?: string;
  updateAvailable: boolean;
  supported: boolean;
  reason?: string;
}

export function ArgoCDSyncChartDialog({
  open, onOpenChange, clusterId, appName, namespace, chart, currentVersion, onSynced,
}: ArgoCDSyncChartDialogProps) {
  const server = useSettingsStore((s) => s.authProviderConfigs['argocd']?.server);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drops a check response that arrives after the dialog closed or re-ran.
  const checkIdRef = useRef(0);

  const url = `/api/clusters/${encodeURIComponent(clusterId)}/argocd/apps/${encodeURIComponent(appName)}/sync-chart-latest`;

  const runCheck = useCallback(async () => {
    const checkId = ++checkIdRef.current;
    setLoading(true);
    setError(null);
    setNeedsLogin(false);
    try {
      const res = await apiClient.post<CheckResponse>(url, { namespace, server, checkOnly: true }, { timeoutMs: LONG_RUNNING_TIMEOUT_MS });
      if (checkId !== checkIdRef.current) return;
      setCheck(res);
    } catch (err: unknown) {
      if (checkId !== checkIdRef.current) return;
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        setNeedsLogin(true);
      } else {
        setError(apiErr?.message || 'Check failed');
      }
    } finally {
      if (checkId === checkIdRef.current) setLoading(false);
    }
  }, [url, namespace, server]);

  useEffect(() => {
    if (open) void runCheck();
    else {
      checkIdRef.current += 1;
      setCheck(null); setError(null); setNeedsLogin(false); setLoading(false);
    }
  }, [open, runCheck]);

  const handleLogin = async () => {
    if (!server) { toast.error('Set the ArgoCD server in Settings > Auth Providers first.'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/auth/argocd/login', { server, authMode: 'sso' });
      toast.success('Logged in to ArgoCD');
      await runCheck();
    } catch (err: unknown) {
      toast.error(`ArgoCD login failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await apiClient.post(url, { namespace, server, sync: true }, { timeoutMs: LONG_RUNNING_TIMEOUT_MS });
      toast.success(`${appName}: synced to latest chart`);
      onSynced?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(syncing, onOpenChange)}>
      <DialogContent busy={syncing}>
        <DialogHeader>
          <DialogTitle>Sync chart to latest — {appName}</DialogTitle>
          <DialogDescription>
            Chart <span className="font-mono">{chart}</span>
            {currentVersion && <> (currently <span className="font-mono">{currentVersion}</span>)</>}
          </DialogDescription>
        </DialogHeader>

        <DialogContextList entries={{ cluster: clusterId, namespace, application: appName }} />

        <div className="space-y-2 text-sm">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>}

          {!loading && needsLogin && (
            <div className="space-y-2">
              <p className="text-muted-foreground">Not logged in to ArgoCD.</p>
              <Button size="sm" onClick={handleLogin}><LogIn className="h-4 w-4" /> Login to ArgoCD</Button>
            </div>
          )}

          {!loading && error && <p className="text-destructive">{error}</p>}

          {!loading && check && (
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Target revision</span>
                <span className="font-mono">{check.currentRevision || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Synced revision</span>
                <span className="font-mono">{check.syncedRevision || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span className="font-mono">
                  {!check.supported ? 'Not supported' : check.updateAvailable ? 'Update available' : 'Up to date'}
                </span>
              </div>
              {!check.supported && check.reason && (
                <p className="text-muted-foreground pt-1">{check.reason}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>Close</Button>
          <Button onClick={handleSync} disabled={syncing || loading || !check?.updateAvailable}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Update &amp; Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
