'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useClusters } from '@/hooks/use-clusters';
import { useNamespaces } from '@/hooks/use-namespaces';
import { YamlDiffView } from '@/components/shared/yaml-diff-view';
import yaml from 'js-yaml';
import type { KubeResource, NamespaceInfo } from '@/types/resource';

interface ResourceDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceClusterId: string;
  sourceNamespace: string;
  resourceType: string;
  resourceName: string;
  sourceResource: KubeResource;
}

const METADATA_NOISE_KEYS = [
  'uid',
  'resourceVersion',
  'creationTimestamp',
  'managedFields',
  'selfLink',
  'generation',
];

function cleanForDiff(resource: KubeResource): Record<string, unknown> {
  if (!resource) return resource;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status: _status, ...rest } = resource;
  const cleaned: Record<string, unknown> = { ...rest };
  if (resource.metadata) {
    cleaned.metadata = Object.fromEntries(
      Object.entries(resource.metadata).filter(([k]) => !METADATA_NOISE_KEYS.includes(k)),
    );
  }
  return cleaned;
}

const SAME_CLUSTER = '__same__';

export function ResourceDiffDialog({
  open,
  onOpenChange,
  sourceClusterId,
  sourceNamespace,
  resourceType,
  resourceName,
  sourceResource,
}: ResourceDiffDialogProps) {
  const { clusters } = useClusters();
  const decodedSourceCluster = decodeURIComponent(sourceClusterId);

  const [targetClusterId, setTargetClusterId] = useState<string | undefined>(undefined);
  const [targetNamespace, setTargetNamespace] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<{ source: string; target: string } | null>(
    null,
  );

  // Resolve actual cluster name for API calls
  const resolvedTargetCluster =
    targetClusterId === SAME_CLUSTER ? decodedSourceCluster : targetClusterId;

  // Only fetch target namespaces when dialog is open and a target cluster is selected
  const { namespaces: targetNamespaces } = useNamespaces(
    open && resolvedTargetCluster ? resolvedTargetCluster : null,
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTargetClusterId(undefined);
      setTargetNamespace(undefined);
      setDiffResult(null);
      setError(null);
    }
  }, [open]);

  // Include source cluster in target list (for same-cluster cross-namespace comparison)
  const connectedClusters = clusters.filter((c) => c.status === 'connected');

  const handleCompare = async () => {
    if (!resolvedTargetCluster || !targetNamespace || loading) return;

    // Prevent comparing the exact same resource
    if (
      resolvedTargetCluster === decodedSourceCluster &&
      targetNamespace === sourceNamespace
    ) {
      setError(
        'Source and target are the same cluster/namespace. Select a different target.',
      );
      return;
    }

    setLoading(true);
    setError(null);
    setDiffResult(null);

    try {
      const url = `/api/clusters/${encodeURIComponent(resolvedTargetCluster)}/resources/${targetNamespace}/${resourceType}/${resourceName}`;
      const targetResource = await apiClient.get<KubeResource>(url);

      const sourceYaml = yaml.dump(cleanForDiff(sourceResource), {
        lineWidth: -1,
        sortKeys: true,
      });
      const targetYaml = yaml.dump(cleanForDiff(targetResource), {
        lineWidth: -1,
        sortKeys: true,
      });

      setDiffResult({ source: sourceYaml, target: targetYaml });
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 404) {
        setError(
          `Resource "${resourceName}" not found in ${resolvedTargetCluster}/${targetNamespace}. Pods have unique names per cluster — try comparing Deployments, StatefulSets, ConfigMaps, or Services instead.`,
        );
      } else if (apiErr.status === 401 || apiErr.status === 403) {
        setError('Authentication error: cannot access target cluster');
      } else {
        setError(apiErr.message || 'Failed to fetch target resource');
      }
    } finally {
      setLoading(false);
    }
  };

  const canCompare = !!resolvedTargetCluster && !!targetNamespace && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Compare {resourceName}</DialogTitle>
          <DialogDescription>
            Source: {decodedSourceCluster} / {sourceNamespace}
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-end gap-3'>
          <div className='flex-1 space-y-1'>
            <label className='text-xs text-muted-foreground'>Target Cluster</label>
            <Select
              value={targetClusterId}
              onValueChange={(v) => {
                setTargetClusterId(v);
                setTargetNamespace(undefined);
                setDiffResult(null);
                setError(null);
              }}
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder='Select cluster...' />
              </SelectTrigger>
              <SelectContent>
                {connectedClusters.map((c) => (
                  <SelectItem
                    key={c.name}
                    value={c.name === decodedSourceCluster ? SAME_CLUSTER : c.name}
                  >
                    {c.name}
                    {c.name === decodedSourceCluster && ' (same cluster)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex-1 space-y-1'>
            <label className='text-xs text-muted-foreground'>Target Namespace</label>
            <Select
              value={targetNamespace}
              onValueChange={(v) => {
                setTargetNamespace(v);
                setDiffResult(null);
                setError(null);
              }}
              disabled={!targetClusterId}
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder='Select namespace...' />
              </SelectTrigger>
              <SelectContent>
                {targetNamespaces.map((ns: NamespaceInfo) => (
                  <SelectItem key={ns.name} value={ns.name}>
                    {ns.name}
                    {ns.name === sourceNamespace &&
                    resolvedTargetCluster === decodedSourceCluster
                      ? ' (same)'
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleCompare} disabled={!canCompare} className='h-9'>
            {loading ? <Loader2 className='h-4 w-4 animate-spin mr-1' /> : null}
            Compare
          </Button>
        </div>

        {error && (
          <div className='rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive'>
            {error}
          </div>
        )}

        {diffResult && (
          <div className='mt-2'>
            <div className='flex items-center gap-4 text-xs text-muted-foreground mb-2'>
              <span>
                Source: {decodedSourceCluster}/{sourceNamespace}
              </span>
              <span>
                Target: {resolvedTargetCluster}/{targetNamespace}
              </span>
            </div>
            <YamlDiffView original={diffResult.source} modified={diffResult.target} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
