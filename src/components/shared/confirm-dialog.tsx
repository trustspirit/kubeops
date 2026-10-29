'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { guardOpenChange } from '@/lib/dialog-busy';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  loading?: boolean;
  /**
   * The action is in flight: the dialog cannot be dismissed and Confirm is
   * disabled. Defaults to `loading`, which already means exactly that.
   */
  busy?: boolean;
  /** Keeps Confirm disabled, e.g. until an acknowledgement is ticked. */
  confirmDisabled?: boolean;
  context?: { cluster?: string; namespace?: string; kind?: string; name?: string };
  /** Extra content between the context and the footer. */
  children?: ReactNode;
}

/**
 * The "where will this land" summary shown in action dialogs: cluster,
 * namespace, resource. Falsy values are skipped.
 */
export function DialogContextList({
  entries,
  className,
}: {
  entries: Record<string, string | undefined | null>;
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-xs', className)}>
      {Object.entries(entries).map(([label, value]) => value ? (
        <div key={label} className="contents">
          <dt className="capitalize text-muted-foreground">{label}</dt>
          <dd className="truncate font-mono" title={value}>{value}</dd>
        </div>
      ) : null)}
    </dl>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  onConfirm,
  loading,
  busy = loading,
  confirmDisabled,
  context,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={guardOpenChange(busy, onOpenChange)}>
      <DialogContent busy={busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {context && <DialogContextList entries={context} />}
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => { if (!busy) onConfirm(); }}
            disabled={busy || confirmDisabled}
          >
            {loading ? `${confirmLabel} in progress…` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
