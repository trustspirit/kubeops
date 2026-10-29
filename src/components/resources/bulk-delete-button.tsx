'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { singularize } from '@/lib/kubectl-command';
import { groupByNamespace, toBulkTargets, type BulkTarget } from '@/lib/bulk-selection';
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
  // What the user confirmed is what gets deleted: the selection is frozen when
  // the dialog opens, so a poll that changes the rows cannot alter the batch.
  const [pending, setPending] = useState<BulkTarget[]>([]);

  const kind = singularize(resourceType);
  const liveTargets = useMemo(() => toBulkTargets(resources, fallbackNamespace), [resources, fallbackNamespace]);
  const groups = useMemo(() => groupByNamespace(pending), [pending]);

  const openConfirm = () => {
    setPending(liveTargets);
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);

    const failures: string[] = [];
    // Sequential: a bulk delete of 50 pods should not open 50 simultaneous
    // connections to the API server.
    for (const { name, namespace } of pending) {
      try {
        await apiClient.delete(
          `/api/clusters/${encodeURIComponent(clusterId)}/resources/${encodeURIComponent(namespace)}/${resourceType}/${encodeURIComponent(name)}`,
        );
      } catch (err) {
        failures.push(`${namespace}/${name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setDeleting(false);
    setOpen(false);

    const succeeded = pending.length - failures.length;
    if (failures.length === 0) {
      toast.success(`Deletion requested for ${succeeded} ${kind}${succeeded === 1 ? '' : 's'}`);
    } else {
      toast.error(`${failures.length} of ${pending.length} deletions failed`, {
        description: failures.slice(0, 3).join('\n'),
      });
    }
    onDeleted();
  };

  const count = pending.length;

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        className="h-8 gap-1.5"
        onClick={openConfirm}
        disabled={liveTargets.length === 0}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {open && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Delete ${count} ${kind}${count === 1 ? '' : 's'}?`}
          description="This permanently deletes every resource listed below. This action cannot be undone."
          context={{
            cluster: clusterId,
            kind,
            namespace: groups.length === 1 ? groups[0].namespace : `${groups.length} namespaces`,
          }}
          confirmLabel={`Delete ${count}`}
          variant="destructive"
          onConfirm={handleConfirm}
          loading={deleting}
          confirmDisabled={count === 0}
        >
          <div
            className="max-h-64 overflow-y-auto rounded-md border p-2 text-xs"
            role="region"
            aria-label="Resources to delete"
          >
            {groups.map((group) => (
              <div key={group.namespace} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between font-medium text-muted-foreground">
                  <span className="font-mono">{group.namespace}</span>
                  <span>{group.names.length}</span>
                </div>
                <ul className="mt-0.5 space-y-0.5 pl-3">
                  {group.names.map((name) => (
                    <li key={name} className="truncate font-mono" title={`${group.namespace}/${name}`}>{name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
