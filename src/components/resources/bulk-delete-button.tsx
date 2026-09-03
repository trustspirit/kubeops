'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { singularize } from '@/lib/kubectl-command';
import type { KubeResource } from '@/types/resource';

interface BulkDeleteButtonProps {
  clusterId: string;
  resourceType: string;
  /** Used for cluster-scoped resources and for rows without a namespace. */
  fallbackNamespace: string;
  resources: KubeResource[];
  onDeleted: () => void;
}

/** Delete several resources at once — a routine need the row menu could not serve. */
export function BulkDeleteButton({
  clusterId,
  resourceType,
  fallbackNamespace,
  resources,
  onDeleted,
}: BulkDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const kind = singularize(resourceType);
  const names = resources
    .map((r) => r.metadata?.name)
    .filter((name): name is string => Boolean(name));

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);

    const failures: string[] = [];
    // Sequential: a bulk delete of 50 pods should not open 50 simultaneous
    // connections to the API server.
    for (const resource of resources) {
      const name = resource.metadata?.name;
      if (!name) continue;
      const namespace = resource.metadata?.namespace || fallbackNamespace;
      try {
        await apiClient.delete(
          `/api/clusters/${encodeURIComponent(clusterId)}/resources/${encodeURIComponent(namespace)}/${resourceType}/${encodeURIComponent(name)}`,
        );
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setDeleting(false);
    setOpen(false);

    const succeeded = names.length - failures.length;
    if (failures.length === 0) {
      toast.success(`Deletion requested for ${succeeded} ${kind}${succeeded === 1 ? '' : 's'}`);
    } else {
      toast.error(`${failures.length} of ${names.length} deletions failed`, {
        description: failures.slice(0, 3).join('\n'),
      });
    }
    onDeleted();
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setOpen(true)}
        disabled={names.length === 0}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {open && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Delete ${names.length} ${kind}${names.length === 1 ? '' : 's'}?`}
          description="This permanently deletes every selected resource. This action cannot be undone."
          context={{
            cluster: clusterId,
            kind,
            name: names.slice(0, 5).join(', ') + (names.length > 5 ? `, +${names.length - 5} more` : ''),
          }}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleConfirm}
          loading={deleting}
        />
      )}
    </>
  );
}
