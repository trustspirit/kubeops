'use client';

import { useState, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, RotateCcw, Scaling, Trash2, ScrollText, Terminal, GitCompare } from 'lucide-react';
import { ScaleDialog } from '@/components/resources/scale-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { usePanelStore } from '@/stores/panel-store';

interface ResourceActionsProps {
  resourceType: string;
  name: string;
  namespace: string;
  clusterId: string;
  resource: any;
  onMutate?: () => void;
  onCompare?: () => void;
}

export function ResourceActions({
  resourceType,
  name,
  namespace,
  clusterId,
  resource,
  onMutate,
  onCompare,
}: ResourceActionsProps) {
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const addTab = usePanelStore((s) => s.addTab);

  const encodedClusterId = encodeURIComponent(clusterId);
  const canRestart = ['deployments', 'statefulsets', 'daemonsets'].includes(resourceType);
  const canScale = ['deployments', 'statefulsets'].includes(resourceType);
  const isPod = resourceType === 'pods';

  const handleRestart = useCallback(async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await apiClient.patch(
        `/api/clusters/${encodedClusterId}/resources/${namespace}/${resourceType}/${name}`,
        {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
                },
              },
            },
          },
        }
      );
      toast.success(`${name} restarting...`);
      onMutate?.();
    } catch (err: any) {
      toast.error(`Restart failed: ${err.message}`);
    } finally {
      setRestarting(false);
    }
  }, [restarting, encodedClusterId, namespace, resourceType, name, onMutate]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(
        `/api/clusters/${encodedClusterId}/resources/${namespace}/${resourceType}/${name}`
      );
      toast.success(`${name} deleted`);
      onMutate?.();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [deleting, encodedClusterId, namespace, resourceType, name, onMutate]);

  const handleLogs = useCallback(() => {
    const container = resource?.spec?.containers?.[0]?.name;
    if (!container) return;
    addTab({
      id: `logs-${name}-${container}`,
      type: 'logs',
      title: `Logs: ${name}`,
      clusterId: encodedClusterId,
      namespace,
      podName: name,
      container,
    });
  }, [resource, name, encodedClusterId, namespace, addTab]);

  const handleExec = useCallback(() => {
    const container = resource?.spec?.containers?.[0]?.name;
    if (!container) return;
    addTab({
      id: `exec-${name}-${container}`,
      type: 'exec',
      title: `Exec: ${name}`,
      clusterId: encodedClusterId,
      namespace,
      podName: name,
      container,
    });
  }, [resource, name, encodedClusterId, namespace, addTab]);

  const currentReplicas = resource?.spec?.replicas ?? resource?.status?.replicas ?? 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {isPod && (
            <>
              <DropdownMenuItem onClick={handleLogs}>
                <ScrollText className="h-4 w-4 mr-2" />
                View Logs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExec}>
                <Terminal className="h-4 w-4 mr-2" />
                Exec
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canRestart && (
            <DropdownMenuItem onClick={handleRestart} disabled={restarting}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {restarting ? 'Restarting...' : 'Restart'}
            </DropdownMenuItem>
          )}
          {canScale && (
            <DropdownMenuItem onClick={() => setScaleOpen(true)}>
              <Scaling className="h-4 w-4 mr-2" />
              Scale
            </DropdownMenuItem>
          )}
          {onCompare && (
            <DropdownMenuItem onClick={onCompare}>
              <GitCompare className="h-4 w-4 mr-2" />
              Compare...
            </DropdownMenuItem>
          )}
          {(canRestart || canScale || isPod || onCompare) && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Only mount dialogs when open — avoids N dialog instances for N rows */}
      {canScale && scaleOpen && (
        <ScaleDialog
          open={scaleOpen}
          onOpenChange={setScaleOpen}
          clusterId={clusterId}
          namespace={namespace}
          resourceType={resourceType}
          name={name}
          currentReplicas={currentReplicas}
          onScaled={onMutate}
        />
      )}

      {deleteOpen && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${name}?`}
          description={`This will permanently delete the ${resourceType.slice(0, -1)} "${name}". This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
    </>
  );
}
