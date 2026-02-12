'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Layers,
  Copy,
  Box,
  Network,
  Globe,
  Database,
  Cpu,
  ExternalLink,
  Info,
  Clock,
  type LucideIcon,
} from 'lucide-react';

function compactAge(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0) return '0s';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm > 0 ? `${h}h${rm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  if (d < 30) {
    const rh = h % 24;
    return rh > 0 ? `${d}d${rh}h` : `${d}d`;
  }
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}

const KIND_ICONS: Record<string, LucideIcon> = {
  Deployment: Layers,
  ReplicaSet: Copy,
  Pod: Box,
  Service: Network,
  Ingress: Globe,
  StatefulSet: Database,
  DaemonSet: Cpu,
};

const HEALTH_BORDER: Record<string, string> = {
  Healthy: 'border-green-500/60',
  Progressing: 'border-yellow-500/60',
  Degraded: 'border-red-500/60',
  Unknown: 'border-gray-400/60',
};

const HEALTH_DOT: Record<string, string> = {
  Healthy: 'bg-green-500',
  Progressing: 'bg-yellow-500 animate-pulse',
  Degraded: 'bg-red-500 animate-pulse',
  Unknown: 'bg-gray-400',
};

const STATUS_COLOR: Record<string, string> = {
  Healthy: 'text-muted-foreground',
  Progressing: 'text-yellow-500',
  Degraded: 'text-red-500',
  Unknown: 'text-muted-foreground',
};

export interface ResourceNodeData {
  kind: string;
  name: string;
  health: 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown';
  status?: string;
  info?: string;
  href?: string;
  namespace?: string;
  clusterId?: string;
  createdAt?: string;
  appLabel?: string;
  onInfoClick?: (data: ResourceNodeData) => void;
  [key: string]: unknown;
}

function ResourceNodeComponent({ data }: NodeProps) {
  const router = useRouter();
  const { kind, name, health, status, info, href, createdAt, onInfoClick } = data as unknown as ResourceNodeData;
  const age = compactAge(createdAt as string | undefined);
  const Icon = KIND_ICONS[kind] || Box;
  const borderClass = HEALTH_BORDER[health] || HEALTH_BORDER.Unknown;
  const dotClass = HEALTH_DOT[health] || HEALTH_DOT.Unknown;
  const statusColor = STATUS_COLOR[health] || STATUS_COLOR.Unknown;

  const stopEvent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const handleDetail = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (href) router.push(href as string);
    },
    [href, router]
  );

  const handleInfo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (onInfoClick) (onInfoClick as (d: ResourceNodeData) => void)(data as unknown as ResourceNodeData);
    },
    [onInfoClick, data]
  );

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
      <div
        className={`
          group flex items-center gap-2.5 rounded-lg border-2 bg-card px-3 py-2 shadow-sm
          min-w-[160px] max-w-[260px]
          hover:shadow-md hover:bg-accent/50 transition-all
          ${borderClass}
        `}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase text-muted-foreground tracking-wide">
              {kind}
            </span>
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
            {status && (
              <span className={`text-[10px] font-medium truncate ${statusColor}`}>
                {status}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold truncate" title={name}>
            {name}
          </span>
          <div className="flex items-center gap-1.5">
            {info && (
              <span className="text-[10px] text-muted-foreground truncate">{info}</span>
            )}
            {age && (
              <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 shrink-0">
                <Clock className="h-2.5 w-2.5" />{age}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {(href || onInfoClick) && (
          <div className="flex flex-col gap-0.5 shrink-0">
            {href && (
              <button
                onMouseDown={stopEvent}
                onClick={handleDetail}
                className="nopan nodrag nowheel pointer-events-auto cursor-pointer rounded bg-muted/80 p-1 hover:bg-accent transition-colors"
                title="Open detail page"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {onInfoClick && (
              <button
                onMouseDown={stopEvent}
                onClick={handleInfo}
                className="nopan nodrag nowheel pointer-events-auto cursor-pointer rounded bg-muted/80 p-1 hover:bg-accent transition-colors"
                title="Quick info"
              >
                <Info className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
    </>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
