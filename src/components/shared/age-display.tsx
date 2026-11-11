'use client';

import { memo } from 'react';
import { useAgeTick, ageTickInterval } from '@/hooks/use-age-tick';
import { formatAge } from '@/lib/format-age';

export const AgeDisplay = memo(function AgeDisplay({ timestamp }: { timestamp?: string }) {
  const interval = ageTickInterval(timestamp);
  useAgeTick(interval); // re-render at a rate appropriate for the age

  if (!timestamp) return <span className="text-muted-foreground">-</span>;
  return <span title={new Date(timestamp).toLocaleString()}>{formatAge(timestamp)}</span>;
});
