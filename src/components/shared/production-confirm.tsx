'use client';

import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { isProductionCluster } from '@/lib/cluster-environment';

/**
 * Extra friction for destructive actions on a production cluster: the user has
 * to type the name of what they are about to affect. Returns nothing to render
 * and never blocks on any other cluster.
 */
export function useProductionConfirm(
  clusterName: string | null | undefined,
  expected: string | null | undefined,
  open: boolean,
): { blocked: boolean; field: ReactNode } {
  const [typed, setTyped] = useState('');
  // Reset whenever the dialog opens or closes, without an effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    setTyped('');
  }

  const required = Boolean(expected) && isProductionCluster(clusterName);
  if (!required || !expected) return { blocked: false, field: null };

  return {
    blocked: typed.trim() !== expected,
    field: (
      <div className="space-y-1.5 rounded-md border border-red-500/40 bg-red-500/10 p-3">
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          This is a production cluster ({clusterName}).
        </p>
        <label htmlFor="production-confirm-input" className="block text-xs text-muted-foreground">
          Type <span className="select-all font-mono text-foreground">{expected}</span> to confirm.
        </label>
        <Input
          id="production-confirm-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-8 font-mono text-xs"
        />
      </div>
    ),
  };
}
