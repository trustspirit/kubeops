'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, RotateCcw, Scaling, Trash2, ScrollText, Terminal, GitCompare, Bug, Loader2 } from 'lucide-react';
import { ScaleDialog } from '@/components/resources/scale-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CascadeDeleteDialog } from '@/components/shared/cascade-delete-dialog';
import { NodeDebugDialog } from '@/components/nodes/node-debug-dialog';
import { PodDebugDialog } from '@/components/pods/pod-debug-dialog';
import { apiClient } from '@/lib/api-client';
import { singularize } from '@/lib/kubectl-command';
import { listPodContainers } from '@/lib/pod-containers';
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
  const [restartOpen, setRestartOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
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
      setRestartOpen(false);
    }
  }, [restarting, encodedClusterId, namespace, resourceType, name, onMutate]);

  const handleDelete = useCallback(async (propagationPolicy?: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const query = propagationPolicy
        ? `?propagationPolicy=${encodeURIComponent(propagationPolicy)}`
        : '';
      await apiClient.delete(
        `/api/clusters/${encodedClusterId}/resources/${namespace}/${resourceType}/${name}${query}`
      );
      toast.success(`${name} deletion requested`);
      setDeleteRequested(true);
      onMutate?.();
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [deleting, encodedClusterId, namespace, resourceType, name, onMutate]);

  const containers = useMemo(() => listPodContainers(resource), [resource]);

  const openPanelTab = useCallback((type: 'logs' | 'exec', container: string) => {
    addTab({
      type,
      title: `${type === 'logs' ? 'Logs' : 'Exec'}: ${name}/${container}`,
      clusterId: encodedClusterId,
      namespace,
      podName: name,
      container,
    });
  }, [addTab, encodedClusterId, namespace, name]);

  // A pod row can arrive without a full spec (partial list projections, or a
  // pod that only has init containers left). Say so instead of no-opping.
  const handleContainerAction = useCallback((type: 'logs' | 'exec') => {
    if (containers.length === 0) {
      toast.error(`No containers found for ${name}`, {
        description: 'The pod spec is still loading or the pod has no runnable containers.',
      });
      return;
    }
    openPanelTab(type, containers[0].name);
  }, [containers, name, openPanelTab]);

  const kind = singularize(resourceType);
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
            aria-label={`Actions for ${name}`}
            disabled={deleteRequested}
            title={deleteRequested ? 'Deletion requested' : undefined}
          >
            {deleteRequested ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {isPod && (
            <>
              {containers.length > 1 ? (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ScrollText className="h-4 w-4 mr-2" />
                      View Logs
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {containers.map((c) => (
                        <DropdownMenuItem key={c.name} onClick={() => openPanelTab('logs', c.name)}>
                          {c.name}
                          {c.init && <span className="ml-2 text-xs text-muted-foreground">init</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Terminal className="h-4 w-4 mr-2" />
                      Exec
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {containers.map((c) => (
                        <DropdownMenuItem key={c.name} onClick={() => openPanelTab('exec', c.name)}>
                          {c.name}
                          {c.init && <span className="ml-2 text-xs text-muted-foreground">init</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => handleContainerAction('logs')}>
                    <ScrollText className="h-4 w-4 mr-2" />
                    View Logs
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleContainerAction('exec')}>
                    <Terminal className="h-4 w-4 mr-2" />
                    Exec
                  </DropdownMenuItem>
                </>
              )}
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
            <DropdownMenuItem onClick={() => setRestartOpen(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart
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

      {canRestart && restartOpen && (
        <ConfirmDialog
          open={restartOpen}
          onOpenChange={setRestartOpen}
          title={`Restart ${name}?`}
          description="This will perform a rolling restart of all pods."
          context={{ cluster: clusterId, namespace, kind, name }}
          confirmLabel="Restart"
          onConfirm={handleRestart}
          loading={restarting}
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
          onConfirm={(propagationPolicy) => handleDelete(propagationPolicy)}
          loading={deleting}
        />
      )}

      {deleteOpen && !hasDependents && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${name}?`}
          description={`This will permanently delete the ${kind} "${name}". This action cannot be undone.`}
          context={{ cluster: clusterId, namespace, kind, name }}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => handleDelete()}
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
          containers={containers.map((c) => c.name)}
        />
      )}
    </>
  );
}
