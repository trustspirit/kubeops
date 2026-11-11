'use client';

import { ENVIRONMENT_LABELS, getClusterEnvironment, type ClusterEnvironment } from '@/lib/cluster-environment';
import { cn } from '@/lib/utils';

const BADGE_STYLES: Record<ClusterEnvironment, string> = {
  production: 'border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-400',
  staging: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400',
  development: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export const ENVIRONMENT_BAR_STYLES: Record<ClusterEnvironment, string> = {
  production: 'bg-red-500',
  staging: 'bg-amber-500',
  development: 'bg-transparent',
};

/** A small PROD / STAGING / DEV marker. Renders nothing for unclassified clusters. */
export function EnvironmentBadge({ clusterName, className }: { clusterName: string | null | undefined; className?: string }) {
  const environment = getClusterEnvironment(clusterName);
  if (!environment) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide',
        BADGE_STYLES[environment],
        className,
      )}
      title={`${ENVIRONMENT_LABELS[environment]} cluster (detected from the context name)`}
    >
      {ENVIRONMENT_LABELS[environment]}
    </span>
  );
}
