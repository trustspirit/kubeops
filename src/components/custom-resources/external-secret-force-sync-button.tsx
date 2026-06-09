'use client';

import { type MouseEvent, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { buildExternalSecretForceSyncPatch } from '@/lib/external-secret-force-sync';
import { toast } from 'sonner';

interface ExternalSecretForceSyncButtonProps {
  apiUrl: string;
  name: string;
  onSynced?: () => void;
  compact?: boolean;
}

export function ExternalSecretForceSyncButton({
  apiUrl,
  name,
  onSynced,
  compact = false,
}: ExternalSecretForceSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const handleForceSync = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (syncing) return;

    setSyncing(true);
    try {
      await apiClient.patch(apiUrl, buildExternalSecretForceSyncPatch());
      toast.success(`${name} force sync requested`);
      onSynced?.();
    } catch (err: unknown) {
      toast.error(`Force sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      className={compact ? 'h-7 w-7' : undefined}
      disabled={syncing}
      onClick={handleForceSync}
      title="Force sync"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''} ${compact ? '' : 'mr-1'}`} />
      {!compact && (syncing ? 'Syncing...' : 'Force Sync')}
    </Button>
  );
}
