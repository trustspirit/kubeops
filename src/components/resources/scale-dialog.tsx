'use client';

import { useState, useEffect, useRef } from 'react';
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
import { DialogContextList } from '@/components/shared/confirm-dialog';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { guardOpenChange } from '@/lib/dialog-busy';
import { buildScalePatch, parseReplicaInput } from '@/lib/replica-input';
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
  const [input, setInput] = useState(String(currentReplicas));
  const [loading, setLoading] = useState(false);
  const wasOpenRef = useRef(open);

  // Seed the field when the dialog opens. Following `currentReplicas` while
  // open overwrote what the user was typing on every poll during a rollout.
  useEffect(() => {
    if (open && !wasOpenRef.current) setInput(String(currentReplicas));
    wasOpenRef.current = open;
  }, [open, currentReplicas]);

  const parsed = parseReplicaInput(input);
  const replicas = parsed.ok ? parsed.replicas : null;

  const handleScale = async () => {
    if (loading || replicas === null) return;
    setLoading(true);
    try {
      // A merge patch of only spec.replicas: the old GET + full PUT carried a
      // resourceVersion that a rollout in progress invalidated, so scaling a
      // busy workload failed with 409.
      const url = `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${name}`;
      await apiClient.patch(url, buildScalePatch(replicas));
      toast.success(`Scaled ${name} to ${replicas} replica${replicas === 1 ? '' : 's'}`);
      onOpenChange(false);
      onScaled?.();
    } catch (err: unknown) {
      toast.error(`Scale failed: ${(err instanceof Error ? err.message : 'Unknown error')}`);
    } finally {
      setLoading(false);
    }
  };

  const step = (delta: number) => {
    const base = replicas ?? currentReplicas;
    setInput(String(Math.max(0, base + delta)));
  };

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(loading, onOpenChange)}>
      <DialogContent className="sm:max-w-[400px]" busy={loading}>
        <DialogHeader>
          <DialogTitle>Scale {name}</DialogTitle>
          <DialogDescription>
            Current replicas: {currentReplicas}. Set the desired number of replicas.
          </DialogDescription>
        </DialogHeader>
        <DialogContextList entries={{ cluster: clusterId, namespace, resource: `${resourceType}/${name}` }} />
        <div className="flex items-center gap-4 py-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => step(-1)}
            disabled={loading || (replicas ?? currentReplicas) <= 0}
            aria-label="Decrease replicas"
          >
            -
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && replicas !== null && replicas !== currentReplicas) void handleScale();
            }}
            disabled={loading}
            className="text-center text-lg font-bold w-24"
            aria-label="Desired replicas"
            aria-invalid={!parsed.ok && parsed.error ? true : undefined}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => step(1)}
            disabled={loading}
            aria-label="Increase replicas"
          >
            +
          </Button>
        </div>
        {!parsed.ok && parsed.error && (
          <p className="text-xs text-destructive" role="alert">{parsed.error}</p>
        )}
        {replicas === 0 && currentReplicas !== 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <p>
              Scaling to 0 stops every pod of <span className="font-mono">{name}</span>. The workload will serve no traffic until it is scaled up again.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={replicas === 0 ? 'destructive' : 'default'}
            onClick={handleScale}
            disabled={loading || replicas === null || replicas === currentReplicas}
          >
            {loading ? 'Scaling...' : replicas === null ? 'Scale' : `Scale to ${replicas}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
