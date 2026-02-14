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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bug, Loader2, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { usePanelStore } from '@/stores/panel-store';

const DEBUG_IMAGES = [
  { value: 'busybox', label: 'BusyBox', description: 'Lightweight, basic unix tools' },
  { value: 'alpine', label: 'Alpine', description: 'Package manager (apk), small footprint' },
  { value: 'ubuntu', label: 'Ubuntu', description: 'Full tools, apt package manager' },
  { value: 'nicolaka/netshoot', label: 'Netshoot', description: 'Network debugging (tcpdump, nmap, curl)' },
];

interface PodDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  namespace: string;
  podName: string;
  containers: string[];
}

export function PodDebugDialog({
  open,
  onOpenChange,
  clusterId,
  namespace,
  podName,
  containers,
}: PodDebugDialogProps) {
  const [image, setImage] = useState('busybox');
  const [targetContainer, setTargetContainer] = useState<string>('_none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addTab } = usePanelStore();

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      const encodedClusterId = encodeURIComponent(clusterId);
      const result = await apiClient.post<{ containerName: string; status: string }>(
        `/api/clusters/${encodedClusterId}/resources/${namespace}/pods/${podName}/debug`,
        {
          image,
          targetContainer: targetContainer === '_none' ? undefined : targetContainer,
        }
      );

      toast.success(`Debug container ${result.containerName} attached to ${podName}`);

      // Open terminal tab in bottom panel
      addTab({
        id: `exec-${podName}-${result.containerName}`,
        type: 'exec',
        title: `Debug: ${podName}`,
        clusterId: encodedClusterId,
        namespace,
        podName,
        container: result.containerName,
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const message = errObj?.message || 'Failed to inject debug container';
      setError(message);
      // Show K8s version warning if relevant
      if (message.includes('1.25')) {
        setError(message);
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Pod: {podName}
          </DialogTitle>
          <DialogDescription>
            Injects an ephemeral debug container into the running pod.
            Requires Kubernetes 1.25 or later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Debug Image</label>
            <Select value={image} onValueChange={setImage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEBUG_IMAGES.map((img) => (
                  <SelectItem key={img.value} value={img.value}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{img.label}</span>
                      <span className="text-xs text-muted-foreground">- {img.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Target Container (optional)</label>
            <Select value={targetContainer} onValueChange={setTargetContainer}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None (standalone)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">
                  None (standalone debug container)
                </SelectItem>
                {containers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When a target is selected, the debug container shares the process namespace of that container.
            </p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-600 dark:text-amber-400">Ephemeral containers cannot be removed</p>
              <p className="text-muted-foreground mt-0.5">
                Once added, ephemeral containers persist until the pod is deleted.
                They do not restart and have no resource limits by default.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Injecting debug container...
              </>
            ) : (
              <>
                <Bug className="h-4 w-4 mr-1" />
                Start Debug
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
