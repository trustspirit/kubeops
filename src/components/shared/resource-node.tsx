'use client';

import { memo } from 'react';
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
  type LucideIcon,
} from 'lucide-react';

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
  Progressing: 'bg-yellow-500',
  Degraded: 'bg-red-500',
  Unknown: 'bg-gray-400',
};

export interface ResourceNodeData {
  kind: string;
  name: string;
  health: 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown';
  info?: string;
  href?: string;
  [key: string]: unknown;
}

function ResourceNodeComponent({ data }: NodeProps) {
  const router = useRouter();
  const { kind, name, health, info, href } = data as unknown as ResourceNodeData;
  const Icon = KIND_ICONS[kind] || Box;
  const borderClass = HEALTH_BORDER[health] || HEALTH_BORDER.Unknown;
  const dotClass = HEALTH_DOT[health] || HEALTH_DOT.Unknown;

  const handleClick = () => {
    if (href) {
      router.push(href as string);
    }
  };

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
      <div
        onClick={handleClick}
        className={`
          flex items-center gap-2.5 rounded-lg border-2 bg-card px-3 py-2 shadow-sm
          min-w-[160px] max-w-[240px] cursor-pointer
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
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          </div>
          <span className="text-xs font-semibold truncate" title={name}>
            {name}
          </span>
          {info && (
            <span className="text-[10px] text-muted-foreground truncate">{info}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
    </>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
