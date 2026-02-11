import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  Running: 'bg-green-500/10 text-green-500 border-green-500/20',
  Succeeded: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  Failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  Unknown: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  Active: 'bg-green-500/10 text-green-500 border-green-500/20',
  Terminating: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Bound: 'bg-green-500/10 text-green-500 border-green-500/20',
  Available: 'bg-green-500/10 text-green-500 border-green-500/20',
  Ready: 'bg-green-500/10 text-green-500 border-green-500/20',
  NotReady: 'bg-red-500/10 text-red-500 border-red-500/20',
  True: 'bg-green-500/10 text-green-500 border-green-500/20',
  False: 'bg-red-500/10 text-red-500 border-red-500/20',
  Normal: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = memo(function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
  return (
    <Badge variant="outline" className={cn('font-medium', colorClass, className)}>
      {status}
    </Badge>
  );
});
