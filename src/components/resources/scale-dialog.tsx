'use client';

import { useState, useEffect } from 'react';
import type { KubeResource } from '@/types/resource';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface ScaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  namespace: string;
  resourceType: string;
  name: string;
  currentReplicas: number;
  onScaled?: () => void;
}

export function ScaleDialog({
  open,
  onOpenChange,
  clusterId,
  namespace,
  resourceType,
  name,
  currentReplicas,
  onScaled,
}: ScaleDialogProps) {
  const [replicas, setReplicas] = useState(currentReplicas);
  const [loading, setLoading] = useState(false);

  // Sync replicas with prop when dialog opens or external value changes
  useEffect(() => { setReplicas(currentReplicas); }, [currentReplicas]);

  const handleScale = async () => {
    setLoading(true);
    try {
      // First get the current resource
      const url = `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${name}`;
      const resource = await apiClient.get<KubeResource>(url);

      // Update replicas
      const spec = (resource.spec || {}) as Record<string, unknown>;
      spec.replicas = replicas;
      resource.spec = spec;

      // PUT the updated resource
      await apiClient.put(url, resource);
      toast.success(`Scaled ${name} to ${replicas} replicas`);
      onOpenChange(false);
      onScaled?.();
    } catch (err: unknown) {
      toast.error(`Scale failed: ${(err instanceof Error ? err.message : 'Unknown error')}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Scale {name}</DialogTitle>
          <DialogDescription>
            Current replicas: {currentReplicas}. Set the desired number of replicas.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-xs">
          <dt className="text-muted-foreground">Cluster</dt><dd className="truncate font-mono" title={clusterId}>{clusterId}</dd>
          <dt className="text-muted-foreground">Namespace</dt><dd className="truncate font-mono" title={namespace}>{namespace}</dd>
          <dt className="text-muted-foreground">Resource</dt><dd className="truncate font-mono" title={`${resourceType}/${name}`}>{resourceType}/{name}</dd>
        </dl>
        <div className="flex items-center gap-4 py-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReplicas(Math.max(0, replicas - 1))}
            disabled={replicas <= 0}
            aria-label="Decrease replicas"
          >
            -
          </Button>
          <Input
            type="number"
            min={0}
            value={replicas}
            onChange={(e) => setReplicas(parseInt(e.target.value) || 0)}
            className="text-center text-lg font-bold w-24"
            aria-label="Desired replicas"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReplicas(replicas + 1)}
            aria-label="Increase replicas"
          >
            +
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleScale} disabled={loading || replicas === currentReplicas}>
            {loading ? 'Scaling...' : `Scale to ${replicas}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
