'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface ResourceDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceClusterId: string;
  sourceNamespace: string;
  resourceType: string;
  resourceName: string;
  sourceResource: any;
}

function cleanForDiff(resource: any) {
  if (!resource) return resource;
  const cleaned = { ...resource };
  if (cleaned.metadata) {
    const { uid, resourceVersion, creationTimestamp, managedFields, selfLink, generation, ...restMeta } = cleaned.metadata;
    cleaned.metadata = restMeta;
  }
  delete cleaned.status;
  return cleaned;
}

export function ResourceDiffDialog({
  open,
  onOpenChange,
  sourceClusterId,
  sourceNamespace,
  resourceType,
  resourceName,
  sourceResource,
}: ResourceDiffDialogProps) {
  // Only fetch clusters when dialog is open to avoid wasted requests
  const { clusters } = useClusters();
  const [targetClusterId, setTargetClusterId] = useState<string>('');
  const [targetNamespace, setTargetNamespace] = useState<string>(sourceNamespace);
  // Only fetch target namespaces when dialog is open and a target cluster is selected
  const { namespaces: targetNamespaces } = useNamespaces(
    open && targetClusterId ? targetClusterId : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<{ source: string; target: string } | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTargetClusterId('');
      setTargetNamespace(sourceNamespace);
      setDiffResult(null);
      setError(null);
    }
  }, [open, sourceNamespace]);

  const connectedClusters = clusters.filter(
    (c) => c.status === 'connected' && c.name !== decodeURIComponent(sourceClusterId)
  );

  const handleCompare = async () => {
    if (!targetClusterId || loading) return;
    setLoading(true);
    setError(null);
    setDiffResult(null);

    try {
      const url = `/api/clusters/${encodeURIComponent(targetClusterId)}/resources/${targetNamespace}/${resourceType}/${resourceName}`;
      const targetResource = await apiClient.get<any>(url);

      const sourceYaml = yaml.dump(cleanForDiff(sourceResource), { lineWidth: -1, sortKeys: true });
      const targetYaml = yaml.dump(cleanForDiff(targetResource), { lineWidth: -1, sortKeys: true });

      setDiffResult({ source: sourceYaml, target: targetYaml });
    } catch (err: any) {
      if (err.status === 404) {
        setError(`Resource "${resourceName}" not found in target cluster/namespace`);
      } else if (err.status === 401 || err.status === 403) {
        setError('Authentication error: cannot access target cluster');
      } else {
        setError(err.message || 'Failed to fetch target resource');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare {resourceName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Target Cluster</label>
            <Select value={targetClusterId} onValueChange={(v) => { setTargetClusterId(v); setDiffResult(null); setError(null); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select cluster..." />
              </SelectTrigger>
              <SelectContent>
                {connectedClusters.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Target Namespace</label>
            <Select value={targetNamespace} onValueChange={(v) => { setTargetNamespace(v); setDiffResult(null); setError(null); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={sourceNamespace} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={sourceNamespace}>{sourceNamespace} (same)</SelectItem>
                {targetNamespaces
                  .filter((ns: any) => ns.name !== sourceNamespace)
                  .map((ns: any) => (
                    <SelectItem key={ns.name} value={ns.name}>{ns.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleCompare} disabled={!targetClusterId || loading} className="h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Compare
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {diffResult && (
          <div className="mt-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
              <span>Source: {decodeURIComponent(sourceClusterId)}/{sourceNamespace}</span>
              <span>Target: {targetClusterId}/{targetNamespace}</span>
            </div>
            <YamlDiffView original={diffResult.source} modified={diffResult.target} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
