'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, RefreshCw, RotateCw, Play } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  buildArgoCDRefreshPatch,
  buildArgoCDSyncPatch,
  getArgoCDAppApiUrl,
  type ArgoCDRefreshType,
} from '@/lib/argocd/helpers';

interface ArgoCDActionButtonsProps {
  clusterId: string;
  appName: string;
  namespace: string;
  onChanged?: () => void;
  compact?: boolean;
}

type PendingAction = 'refresh' | 'hard-refresh' | 'sync' | null;

export function ArgoCDActionButtons({
  clusterId,
  appName,
  namespace,
  onChanged,
  compact = false,
}: ArgoCDActionButtonsProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const apiUrl = getArgoCDAppApiUrl(clusterId, appName, namespace);

  const patchApp = async (action: PendingAction, body: Record<string, unknown>, successMessage: string): Promise<boolean> => {
    if (!action) return false;
    setPending(action);
    try {
      await apiClient.patch(apiUrl, body);
      toast.success(successMessage);
      onChanged?.();
      return true;
    } catch (err: unknown) {
      toast.error(`ArgoCD action failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setPending(null);
    }
  };

  const requestRefresh = (type: ArgoCDRefreshType) => {
    const action = type === 'hard' ? 'hard-refresh' : 'refresh';
    const label = type === 'hard' ? 'Hard refresh requested' : 'Refresh requested';
    void patchApp(action, buildArgoCDRefreshPatch(type), `${appName}: ${label}`);
  };

  const requestSync = () => {
    void patchApp('sync', buildArgoCDSyncPatch(), `${appName}: Sync requested`).then((changed) => {
      if (changed) setSyncConfirmOpen(false);
    });
  };

  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size={compact ? 'xs' : 'sm'}
          onClick={() => requestRefresh('normal')}
          disabled={pending !== null}
        >
          {pending === 'refresh' ? <Loader2 className={`${iconClass} animate-spin`} /> : <RefreshCw className={iconClass} />}
          {!compact && 'Refresh'}
        </Button>
        <Button
          variant="outline"
          size={compact ? 'xs' : 'sm'}
          onClick={() => requestRefresh('hard')}
          disabled={pending !== null}
        >
          {pending === 'hard-refresh' ? <Loader2 className={`${iconClass} animate-spin`} /> : <RotateCw className={iconClass} />}
          {!compact && 'Hard Refresh'}
        </Button>
        <Button
          variant="outline"
          size={compact ? 'xs' : 'sm'}
          onClick={() => setSyncConfirmOpen(true)}
          disabled={pending !== null}
        >
          {pending === 'sync' ? <Loader2 className={`${iconClass} animate-spin`} /> : <Play className={iconClass} />}
          {!compact && 'Sync'}
        </Button>
      </div>

      <ConfirmDialog
        open={syncConfirmOpen}
        onOpenChange={setSyncConfirmOpen}
        title={`Sync ${appName}?`}
        description={`This will request ArgoCD to sync Application "${appName}" in namespace "${namespace}".`}
        confirmLabel="Sync"
        onConfirm={requestSync}
        loading={pending === 'sync'}
      />
    </>
  );
}
