'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronRight, ChevronDown, Loader2, Trash2, AlertTriangle, Info } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface DependentNode {
  kind: string;
  name: string;
  namespace?: string;
  status?: string;
  dependents: DependentNode[];
}

interface CascadeDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  namespace: string;
  resourceType: string;
  name: string;
  onConfirm: (propagationPolicy: string) => void;
  loading?: boolean;
}

const PROPAGATION_POLICIES = [
  {
    value: 'Foreground',
    label: 'Foreground',
    description: 'The API server sets the deletionTimestamp, then deletes dependents first, and finally deletes the owner. The owner is not fully deleted until all dependents are removed.',
  },
  {
    value: 'Background',
    label: 'Background',
    description: 'The API server deletes the owner immediately, and the garbage collector deletes the dependents in the background.',
  },
  {
    value: 'Orphan',
    label: 'Orphan',
    description: 'The owner is deleted but its dependents are not. The dependent resources become orphaned and must be manually cleaned up.',
  },
];

function getKindColor(kind: string): string {
  switch (kind) {
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
    case 'ReplicaSet':
      return 'bg-purple-500/15 text-purple-700 dark:text-purple-400';
    case 'Pod':
      return 'bg-green-500/15 text-green-700 dark:text-green-400';
    case 'Job':
    case 'CronJob':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    case 'Service':
      return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getStatusColor(status?: string): string {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'complete') {
    return 'text-green-600 dark:text-green-400';
  }
  if (s === 'pending' || s.includes('ready')) {
    return 'text-amber-600 dark:text-amber-400';
  }
  if (s === 'failed' || s === 'terminating') {
    return 'text-red-600 dark:text-red-400';
  }
  return 'text-muted-foreground';
}

function DependentTree({ node, depth = 0 }: { node: DependentNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.dependents.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 hover:bg-muted/50 rounded px-1 cursor-default"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-medium shrink-0 ${getKindColor(node.kind)}`}>
          {node.kind}
        </Badge>
        <span className="text-sm font-mono truncate">{node.name}</span>
        {node.status && (
          <span className={`text-xs ml-auto shrink-0 ${getStatusColor(node.status)}`}>
            {node.status}
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.dependents.map((child, idx) => (
            <DependentTree key={`${child.kind}-${child.name}-${idx}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CascadeDeleteDialog({
  open,
  onOpenChange,
  clusterId,
  namespace,
  resourceType,
  name,
  onConfirm,
  loading: externalLoading,
}: CascadeDeleteDialogProps) {
  const [tree, setTree] = useState<DependentNode | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [propagationPolicy, setPropagationPolicy] = useState('Foreground');

  const fetchDependents = useCallback(async () => {
    if (!open) return;
    setFetchLoading(true);
    setFetchError(null);

    try {
      const encodedClusterId = encodeURIComponent(clusterId);
      const result = await apiClient.get<{ tree: DependentNode; totalCount: number }>(
        `/api/clusters/${encodedClusterId}/resources/${namespace}/${resourceType}/${name}/dependents`
      );
      setTree(result.tree);
      setTotalCount(result.totalCount);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setFetchError(errObj?.message || 'Failed to fetch dependent resources');
    } finally {
      setFetchLoading(false);
    }
  }, [open, clusterId, namespace, resourceType, name]);

  useEffect(() => {
    if (open) {
      fetchDependents();
    } else {
      setTree(null);
      setTotalCount(0);
      setFetchError(null);
    }
  }, [open, fetchDependents]);

  const selectedPolicy = PROPAGATION_POLICIES.find(p => p.value === propagationPolicy)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete {name}
          </DialogTitle>
          <DialogDescription>
            Review dependent resources that will be affected by this deletion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Dependent tree */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Resource Tree</label>
            <div className="rounded-md border max-h-[300px] overflow-y-auto p-2">
              {fetchLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Scanning dependent resources...
                </div>
              )}
              {fetchError && (
                <div className="text-sm text-destructive py-4 text-center">
                  {fetchError}
                </div>
              )}
              {!fetchLoading && !fetchError && tree && (
                <DependentTree node={tree} />
              )}
              {!fetchLoading && !fetchError && !tree && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No dependent resources found.
                </div>
              )}
            </div>
          </div>

          {/* Total count */}
          {totalCount > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm">
                This will delete <strong>{totalCount + 1}</strong> resources
                ({totalCount} dependent{totalCount !== 1 ? 's' : ''} + the {resourceType.slice(0, -1)} itself).
              </p>
            </div>
          )}

          {/* Propagation Policy */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-medium">Propagation Policy</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    Controls how Kubernetes handles dependent resources when deleting an owner resource.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={propagationPolicy} onValueChange={setPropagationPolicy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPAGATION_POLICIES.map((policy) => (
                  <SelectItem key={policy.value} value={policy.value}>
                    {policy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedPolicy.description}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={externalLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(propagationPolicy)}
            disabled={externalLoading || fetchLoading}
          >
            {externalLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
