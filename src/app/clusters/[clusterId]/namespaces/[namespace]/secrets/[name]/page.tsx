'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgeDisplay } from '@/components/shared/age-display';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ArrowLeft, Trash2, Eye, EyeOff, Copy } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';
import * as yaml from 'js-yaml';

export default function SecretDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: secret, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodeURIComponent(clusterId),
    namespace,
    resourceType: 'secrets',
    name,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} />;
  if (!secret) return null;

  const metadata = secret.metadata || {};
  const data = secret.data || {};
  const labels = metadata.labels || {};

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const decodeValue = (value: string) => {
    try { return atob(value); } catch { return value; }
  };

  const copyValue = (value: string) => {
    navigator.clipboard.writeText(decodeValue(value));
    toast.success('Copied to clipboard');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/secrets/${name}`);
      toast.success(`${name} deleted`);
      router.back();
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            Secret in {namespace} - Type: {secret.type || 'Opaque'}
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">Data ({Object.keys(data).length})</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-4">
          <div className="rounded-md border divide-y">
            {Object.entries(data).length > 0 ? (
              Object.entries(data).map(([key, value]) => {
                const isRevealed = revealedKeys.has(key);
                const decoded = decodeValue(value as string);
                return (
                  <div key={key} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{key}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyValue(value as string)} title="Copy decoded value">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleReveal(key)} title={isRevealed ? 'Hide' : 'Reveal'}>
                          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    <div className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">
                      {isRevealed ? decoded : '••••••••••••••••'}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-sm text-muted-foreground text-center">No data</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Metadata</h3>
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-mono">{metadata.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Namespace</span><span className="font-mono">{metadata.namespace}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{secret.type || 'Opaque'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Keys</span><span>{Object.keys(data).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Age</span><AgeDisplay timestamp={metadata.creationTimestamp} /></div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Labels</h3>
              <div className="rounded-md border p-3 flex flex-wrap gap-1">
                {Object.entries(labels).length > 0 ? (
                  Object.entries(labels).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="text-xs font-mono">{k}={v as string}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No labels</span>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <pre className="rounded-md border bg-muted p-4 overflow-auto max-h-[600px] text-xs font-mono whitespace-pre">
            {yaml.dump(secret, { lineWidth: -1 })}
          </pre>
        </TabsContent>
      </Tabs>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${name}?`} description={`This will permanently delete the secret "${name}".`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
