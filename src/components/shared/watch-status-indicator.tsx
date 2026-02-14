'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useWatchContext } from '@/providers/watch-provider';
import { cn } from '@/lib/utils';

const STATE_CONFIG = {
  connected: {
    icon: Wifi,
    label: 'Live',
    color: 'text-green-500',
    animate: false,
    tooltip: 'Connected to Kubernetes Watch API. Resource changes are streamed in real-time.',
  },
  connecting: {
    icon: Loader2,
    label: 'Connecting...',
    color: 'text-yellow-500',
    animate: true,
    tooltip: 'Establishing connection to Kubernetes Watch API...',
  },
  reconnecting: {
    icon: Loader2,
    label: 'Reconnecting...',
    color: 'text-yellow-500',
    animate: true,
    tooltip: 'Connection lost. Attempting to reconnect to Kubernetes Watch API...',
  },
  disconnected: {
    icon: WifiOff,
    label: 'Polling mode',
    color: 'text-muted-foreground',
    animate: false,
    tooltip: 'Watch connection is inactive. Resources are updated via periodic polling.',
  },
} as const;

export function WatchStatusIndicator({ className }: { className?: string }) {
  const watchCtx = useWatchContext();

  if (!watchCtx) return null;

  const config = STATE_CONFIG[watchCtx.connectionState];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-1.5 text-xs', className)}>
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              config.color,
              config.animate && 'animate-spin',
            )}
          />
          <span className={config.color}>{config.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {config.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
