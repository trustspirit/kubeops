'use client';

import useSWR, { mutate } from 'swr';
import { apiClient, fetcher } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink, Square, Plug } from 'lucide-react';

interface PortForward {
  id: string;
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  containerPort: number;
  localPort: number;
  status: 'starting' | 'active' | 'error';
  error?: string;
}

export default function PortForwardingPage() {
  const { data, isLoading } = useSWR<{ forwards: PortForward[] }>(
    '/api/port-forward',
    fetcher,
    { refreshInterval: 10000 }
  );

  const forwards = data?.forwards || [];

  const handleStop = async (id: string) => {
    try {
      await apiClient.delete(`/api/port-forward?id=${encodeURIComponent(id)}`);
      mutate('/api/port-forward');
      toast.success('Port forward stopped');
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop port forward');
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default' as const;
      case 'starting':
        return 'secondary' as const;
      case 'error':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Port Forwarding</h1>
          <p className="text-sm text-muted-foreground">
            Manage active port forwards to cluster resources
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : forwards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Plug className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No active port forwards
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Start a port forward from a Pod or Service detail page
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Local Port</TableHead>
                <TableHead>Container Port</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwards.map((fwd) => (
                <TableRow key={fwd.id}>
                  <TableCell className="font-mono text-sm">{fwd.id}</TableCell>
                  <TableCell className="font-mono">{fwd.localPort}</TableCell>
                  <TableCell className="font-mono">{fwd.containerPort}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(fwd.status)}>
                      {fwd.status}
                    </Badge>
                    {fwd.error && (
                      <span className="ml-2 text-xs text-destructive">{fwd.error}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {fwd.status === 'active' && (
                        <Button variant="outline" size="sm" className="h-7 gap-1.5" asChild>
                          <a
                            href={`http://localhost:${fwd.localPort}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 gap-1.5"
                        onClick={() => handleStop(fwd.id)}
                      >
                        <Square className="h-3.5 w-3.5" />
                        Stop
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
