'use client';

import { useEffect, useState } from 'react';
import { getResourceFreshness } from '@/lib/resource-freshness';
import { cn } from '@/lib/utils';

interface FreshnessIndicatorProps {
  lastUpdatedAt: number | null;
  staleAfterMs?: number;
  className?: string;
}

export function FreshnessIndicator({
  lastUpdatedAt,
  staleAfterMs,
  className,
}: FreshnessIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const freshness = getResourceFreshness(lastUpdatedAt, now, staleAfterMs);

  return (
    <span
      className={cn(freshness.isStale ? 'font-medium text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground', className)}
      title={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : undefined}
      aria-live="polite"
    >
      {freshness.isStale ? `Stale · ${freshness.label}` : freshness.label}
    </span>
  );
}
