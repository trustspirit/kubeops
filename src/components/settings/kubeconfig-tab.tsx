'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Star, StarOff, FileText, Merge } from 'lucide-react';
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
import { useKubeconfigContexts } from '@/hooks/use-kubeconfig-contexts';
import { ContextDialog } from '@/components/settings/context-dialog';
import { MergeKubeconfigDialog } from '@/components/settings/merge-kubeconfig-dialog';
import { toast } from 'sonner';

export function KubeconfigTab() {
  const { contexts, isLoading, mutate } = useKubeconfigContexts();
  const [showAddContext, setShowAddContext] = useState(false);
  const [editContext, setEditContext] = useState<string | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [showRawYaml, setShowRawYaml] = useState(false);
  const [rawYaml, setRawYaml] = useState('');

  const handleSetCurrent = async (name: string) => {
    try {
      const response = await fetch(`/api/kubeconfig/contexts/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setAsCurrent: true }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set current context');
      }
      toast.success(`Current context set to "${name}"`);
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const response = await fetch(`/api/kubeconfig/contexts/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete context');
      }
      toast.success(`Context "${name}" deleted`);
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleEditRawYaml = async () => {
    try {
      const response = await fetch('/api/kubeconfig?format=raw');
      if (!response.ok) throw new Error('Failed to load kubeconfig');
      const data = await response.json();
      setRawYaml(data.yaml || '');
      setShowRawYaml(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Kubeconfig Contexts</h4>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleEditRawYaml}>
            <FileText className="h-4 w-4" />
            Edit Raw YAML
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowMerge(true)}>
            <Merge className="h-4 w-4" />
            Merge File
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setShowAddContext(true)}>
            <Plus className="h-4 w-4" />
            Add Context
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Cluster</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Namespace</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contexts.map((ctx) => (
            <TableRow key={ctx.name}>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleSetCurrent(ctx.name)}
                  title={ctx.isCurrent ? 'Current context' : 'Set as current'}
                >
                  {ctx.isCurrent ? (
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ) : (
                    <StarOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TableCell>
              <TableCell className="font-medium">
                {ctx.name}
                {ctx.isCurrent && <Badge variant="secondary" className="ml-2">current</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{ctx.cluster}</TableCell>
              <TableCell className="text-muted-foreground">{ctx.user}</TableCell>
              <TableCell className="text-muted-foreground">{ctx.namespace || 'default'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditContext(ctx.name)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(ctx.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && contexts.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No contexts found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ContextDialog
        open={showAddContext}
        onOpenChange={setShowAddContext}
        onSaved={() => mutate()}
      />

      {editContext && (
        <ContextDialog
          open={!!editContext}
          onOpenChange={(open) => { if (!open) setEditContext(null); }}
          contextName={editContext}
          existingContext={contexts.find((c) => c.name === editContext)}
          onSaved={() => { mutate(); setEditContext(null); }}
        />
      )}

      <MergeKubeconfigDialog
        open={showMerge}
        onOpenChange={setShowMerge}
        onMerged={() => mutate()}
      />

      {showRawYaml && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Raw Kubeconfig (read-only)</h4>
            <Button variant="outline" size="sm" onClick={() => setShowRawYaml(false)}>Close</Button>
          </div>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto">
            {rawYaml}
          </pre>
        </div>
      )}
    </div>
  );
}
