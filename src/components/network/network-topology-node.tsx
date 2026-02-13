'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Shield, Box, Globe, Layers } from 'lucide-react';

export interface NetworkNodeData {
  groupId: string;
  labels: Record<string, string>;
  podCount: number;
  policyCount: number;
  pods: string[];
  policies: string[];
  nodeType: 'group' | 'external' | 'any' | 'namespace' | 'isolated';
  [key: string]: unknown;
}

function NetworkTopologyNodeComponent({ data }: NodeProps) {
  const { groupId, labels, podCount, policyCount, nodeType } = data as unknown as NetworkNodeData;

  const isProtected = policyCount > 0;
  const isSpecial = nodeType === 'external' || nodeType === 'any' || nodeType === 'namespace';
  const isIsolated = nodeType === 'isolated';

  const borderClass = isSpecial
    ? 'border-blue-500/60'
    : isProtected
      ? 'border-green-500/60'
      : isIsolated
        ? 'border-yellow-500/60'
        : 'border-gray-400/60';

  const Icon = isSpecial
    ? nodeType === 'external'
      ? Globe
      : nodeType === 'namespace'
        ? Layers
        : Globe
    : isProtected
      ? Shield
      : Box;

  const labelEntries = Object.entries(labels);

  // Display name
  let displayName = groupId;
  if (nodeType === 'external') displayName = 'External (IP Block)';
  else if (nodeType === 'any') displayName = 'Any';
  else if (nodeType === 'namespace') displayName = 'External Namespace';
  else if (nodeType === 'isolated') displayName = 'Isolated Pods';
  else if (groupId === 'all-pods') displayName = 'All Pods';

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted-foreground/40 !border-0"
      />
      <div
        className={`
          group flex flex-col gap-1.5 rounded-lg border-2 bg-card px-3 py-2 shadow-sm
          min-w-[180px] max-w-[280px]
          hover:shadow-md hover:bg-accent/50 transition-all
          ${borderClass}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold truncate">{displayName}</span>
        </div>

        {/* Labels */}
        {labelEntries.length > 0 && !isSpecial && (
          <div className="flex flex-wrap gap-1">
            {labelEntries.slice(0, 3).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground"
              >
                {k}={v}
              </span>
            ))}
            {labelEntries.length > 3 && (
              <span className="text-[9px] text-muted-foreground">
                +{labelEntries.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {!isSpecial && (
            <>
              <span className="flex items-center gap-1">
                <Box className="h-2.5 w-2.5" />
                {podCount} pod{podCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-2.5 w-2.5" />
                {policyCount} polic{policyCount !== 1 ? 'ies' : 'y'}
              </span>
            </>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-muted-foreground/40 !border-0"
      />
    </>
  );
}

export const NetworkTopologyNode = memo(NetworkTopologyNodeComponent);
