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

  const handleScale = async () => {
    setLoading(true);
    try {
      // First get the current resource
      const url = `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${name}`;
      const resource = await apiClient.get<any>(url);

      // Update replicas
      resource.spec.replicas = replicas;

      // PUT the updated resource
      await apiClient.put(url, resource);
      toast.success(`Scaled ${name} to ${replicas} replicas`);
      onOpenChange(false);
      onScaled?.();
    } catch (err: any) {
      toast.error(`Scale failed: ${err.message}`);
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
        <div className="flex items-center gap-4 py-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReplicas(Math.max(0, replicas - 1))}
            disabled={replicas <= 0}
          >
            -
          </Button>
          <Input
            type="number"
            min={0}
            value={replicas}
            onChange={(e) => setReplicas(parseInt(e.target.value) || 0)}
            className="text-center text-lg font-bold w-24"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReplicas(replicas + 1)}
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
