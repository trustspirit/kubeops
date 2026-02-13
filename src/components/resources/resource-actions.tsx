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
import { MoreHorizontal, RotateCcw, Scaling, Trash2, ScrollText, Terminal, GitCompare, Bug } from 'lucide-react';
import { ScaleDialog } from '@/components/resources/scale-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CascadeDeleteDialog } from '@/components/shared/cascade-delete-dialog';
import { NodeDebugDialog } from '@/components/nodes/node-debug-dialog';
import { PodDebugDialog } from '@/components/pods/pod-debug-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { usePanelStore } from '@/stores/panel-store';
import type { KubeResource } from '@/types/resource';

interface ResourceActionsProps {
  resourceType: string;
  name: string;
  namespace: string;
  clusterId: string;
  resource: KubeResource;
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
  const [nodeDebugOpen, setNodeDebugOpen] = useState(false);
  const [podDebugOpen, setPodDebugOpen] = useState(false);
  const addTab = usePanelStore((s) => s.addTab);

  const encodedClusterId = encodeURIComponent(clusterId);
  const canRestart = ['deployments', 'statefulsets', 'daemonsets'].includes(resourceType);
  const canScale = ['deployments', 'statefulsets'].includes(resourceType);
  const isPod = resourceType === 'pods';
  const isNode = resourceType === 'nodes';
  const hasDependents = ['deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs'].includes(resourceType);

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
    } catch (err: unknown) {
      toast.error(`Restart failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [deleting, encodedClusterId, namespace, resourceType, name, onMutate]);

  const handleLogs = useCallback(() => {
    const containers = resource?.spec?.containers as { name: string }[] | undefined;
    const container = containers?.[0]?.name;
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
    const containers = resource?.spec?.containers as { name: string }[] | undefined;
    const container = containers?.[0]?.name;
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

  const spec = resource?.spec as Record<string, unknown> | undefined;
  const status = resource?.status as Record<string, unknown> | undefined;
  const currentReplicas = (spec?.replicas as number) ?? (status?.replicas as number) ?? 0;

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
              <DropdownMenuItem onClick={() => setPodDebugOpen(true)}>
                <Bug className="h-4 w-4 mr-2" />
                Debug
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isNode && (
            <>
              <DropdownMenuItem onClick={() => setNodeDebugOpen(true)}>
                <Bug className="h-4 w-4 mr-2" />
                Debug Shell
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

      {deleteOpen && hasDependents && (
        <CascadeDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          clusterId={clusterId}
          namespace={namespace}
          resourceType={resourceType}
          name={name}
          onConfirm={() => handleDelete()}
          loading={deleting}
        />
      )}

      {deleteOpen && !hasDependents && (
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

      {isNode && nodeDebugOpen && (
        <NodeDebugDialog
          open={nodeDebugOpen}
          onOpenChange={setNodeDebugOpen}
          clusterId={clusterId}
          nodeName={name}
        />
      )}

      {isPod && podDebugOpen && (
        <PodDebugDialog
          open={podDebugOpen}
          onOpenChange={setPodDebugOpen}
          clusterId={clusterId}
          namespace={namespace}
          podName={name}
          containers={(resource?.spec?.containers as { name: string }[] || []).map(c => c.name)}
        />
      )}
    </>
  );
}
