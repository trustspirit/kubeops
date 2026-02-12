'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Star, ArrowRight, Loader2, Tag } from 'lucide-react';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';
import { cn } from '@/lib/utils';

interface ClusterCardProps {
  name: string;
  cluster: string;
  server?: string;
  status: string;
  error?: string;
  isLogging: boolean;
  onClick: () => void;
  parseClusterName: (contextName: string, clusterField: string) => { prefix: string; realName: string };
}

export const ClusterCard = memo(function ClusterCard({ name, cluster, server, status, error, isLogging, onClick, parseClusterName }: ClusterCardProps) {
  const { getClusterMeta, toggleFavorite } = useClusterCatalogStore();
  const meta = getClusterMeta(name);
  const { prefix, realName } = parseClusterName(name, cluster);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isLogging && onClick()}
      onKeyDown={(e) => e.key === 'Enter' && !isLogging && onClick()}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer',
        isLogging && 'opacity-60 pointer-events-none',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0',
              status === 'connected' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-yellow-500',
            )}
          />
          <span className="font-medium truncate">
            {prefix && <span className="text-muted-foreground">{prefix}</span>}
            <span className="text-primary">{realName}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(name); }}
              >
                <Star className={cn('h-3.5 w-3.5', meta.favorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{meta.favorite ? 'Remove from favorites' : 'Add to favorites'}</TooltipContent>
          </Tooltip>
          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            status === 'connected'
              ? 'bg-green-500/10 text-green-500 border-green-500/20'
              : status === 'error'
              ? 'bg-red-500/10 text-red-500 border-red-500/20'
              : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
          )}
        >
          {status}
        </Badge>
        {meta.group && (
          <Badge variant="secondary" className="text-[10px]">{meta.group}</Badge>
        )}
        {meta.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[10px] gap-1">
            <Tag className="h-2.5 w-2.5" />{tag}
          </Badge>
        ))}
      </div>

      {server && (
        <span className="text-xs text-muted-foreground truncate">{server}</span>
      )}
      {error && (
        <span className="text-xs text-destructive truncate">{error}</span>
      )}
      {isLogging && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Logging in...
        </span>
      )}
    </div>
  );
});
