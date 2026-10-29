'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DialogContextList } from '@/components/shared/confirm-dialog';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { guardOpenChange } from '@/lib/dialog-busy';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';

interface HelmRollbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  releaseName: string;
  namespace: string;
  revision: number;
  onRolledBack?: () => void;
}

export function HelmRollbackDialog({
  open,
  onOpenChange,
  clusterId,
  releaseName,
  namespace,
  revision,
  onRolledBack,
}: HelmRollbackDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleRollback = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await apiClient.post(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(releaseName)}/rollback`,
        { revision, namespace },
        { timeoutMs: LONG_RUNNING_TIMEOUT_MS },
      );
      toast.success(`Release "${releaseName}" rolled back to revision ${revision}`);
      onRolledBack?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Rollback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(loading, onOpenChange)}>
      <DialogContent busy={loading}>
        <DialogHeader>
          <DialogTitle>Rollback Release</DialogTitle>
          <DialogDescription>
            Are you sure you want to rollback &ldquo;{releaseName}&rdquo; to revision {revision}?
            This will create a new revision based on the selected one.
          </DialogDescription>
        </DialogHeader>
        <DialogContextList entries={{ cluster: clusterId, namespace, release: releaseName, revision: String(revision) }} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleRollback} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Rolling back...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-1" />
                Rollback to Rev {revision}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
