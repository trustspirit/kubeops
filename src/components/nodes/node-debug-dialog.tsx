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
import { Badge } from '@/components/ui/badge';
import { Bug, Loader2, ShieldAlert } from 'lucide-react';
import { DialogContextList } from '@/components/shared/confirm-dialog';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { guardOpenChange } from '@/lib/dialog-busy';
import { toast } from 'sonner';
import { usePanelStore } from '@/stores/panel-store';

const DEBUG_IMAGES = [
  { value: 'busybox', label: 'BusyBox', description: 'Lightweight, basic unix tools' },
  { value: 'alpine', label: 'Alpine', description: 'Package manager (apk), small footprint' },
  { value: 'ubuntu', label: 'Ubuntu', description: 'Full tools, apt package manager' },
  { value: 'nicolaka/netshoot', label: 'Netshoot', description: 'Network debugging (tcpdump, nmap, curl)' },
];

interface NodeDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  nodeName: string;
}

export function NodeDebugDialog({ open, onOpenChange, clusterId, nodeName }: NodeDebugDialogProps) {
  const [image, setImage] = useState('busybox');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addTab } = usePanelStore();

  const handleStart = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const encodedClusterId = encodeURIComponent(clusterId);
      const result = await apiClient.post<{ podName: string; namespace: string; status: string }>(
        `/api/clusters/${encodedClusterId}/nodes/${encodeURIComponent(nodeName)}/debug`,
        { image },
        { timeoutMs: LONG_RUNNING_TIMEOUT_MS },
      );

      toast.success(`Debug pod ${result.podName} is running on ${nodeName}`);

      // Open terminal tab in bottom panel
      addTab({
        type: 'exec',
        title: `Debug: ${nodeName}`,
        clusterId: encodedClusterId,
        namespace: result.namespace,
        podName: result.podName,
        container: 'debugger',
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const message = errObj?.message || 'Failed to start debug pod';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(loading, onOpenChange)}>
      <DialogContent busy={loading}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Node: {nodeName}
          </DialogTitle>
          <DialogDescription>
            Creates a privileged debug pod scheduled on this node with host access.
            The pod will be automatically cleaned up after 1 hour.
          </DialogDescription>
        </DialogHeader>

        {/* A privileged pod with host access: make the target unmistakable. */}
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2" role="alert">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Privileged pod with full host access
          </div>
          <DialogContextList
            className="bg-background/60"
            entries={{ cluster: clusterId, node: nodeName, namespace: 'default' }}
          />
        </div>

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

          <div className="rounded-md border p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground text-sm">Pod Configuration</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">hostPID</Badge>
              <Badge variant="outline">hostNetwork</Badge>
              <Badge variant="outline">privileged</Badge>
              <Badge variant="outline">host filesystem at /host</Badge>
            </div>
            <p>The debug pod tolerates all taints and has full access to the node.</p>
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
                Starting debug pod...
              </>
            ) : (
              <>
                <Bug className="h-4 w-4 mr-1" />
                Start Debug Shell
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
