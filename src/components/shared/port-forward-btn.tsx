'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { Plug, ExternalLink, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface PortForwardBtnProps {
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  port: number;
}

export function PortForwardBtn({ clusterId, namespace, resourceType, resourceName, port }: PortForwardBtnProps) {
  const { data: pfData } = useSWR('/api/port-forward', { refreshInterval: 3000 });
  const [starting, setStarting] = useState(false);
  const forwards = pfData?.forwards || [];
  const active = forwards.find((f: any) => f.containerPort === port && f.id.includes(resourceName));

  const start = async () => {
    setStarting(true);
    try {
      await apiClient.post('/api/port-forward', { clusterId, namespace, resourceType, resourceName, containerPort: port, localPort: port });
      globalMutate('/api/port-forward');
      toast.success(`Forwarding localhost:${port} → ${port}`);
    } catch (err: any) { toast.error(err.message); }
    finally { setStarting(false); }
  };

  const stop = async () => {
    if (!active) return;
    await apiClient.delete(`/api/port-forward?id=${encodeURIComponent(active.id)}`);
    globalMutate('/api/port-forward');
    toast.success('Port forward stopped');
  };

  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <a href={`http://localhost:${active.localPort}`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors">
          <ExternalLink className="h-3 w-3" />localhost:{active.localPort}
        </a>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={stop}>
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={start} disabled={starting}>
      <Plug className="h-3 w-3" />{starting ? 'Starting...' : 'Forward'}
    </Button>
  );
}
