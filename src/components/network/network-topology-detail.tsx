'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Shield, Box, ArrowRight } from 'lucide-react';
import type { NetworkNodeData } from './network-topology-node';
import type { EdgeData } from '@/hooks/use-network-topology';

interface NetworkTopologyDetailProps {
  selectedNode: NetworkNodeData | null;
  selectedEdge: EdgeData | null;
  onClose: () => void;
}

export function NetworkTopologyDetail({
  selectedNode,
  selectedEdge,
  onClose,
}: NetworkTopologyDetailProps) {
  if (!selectedNode && !selectedEdge) return null;

  return (
    <div className="absolute right-0 top-0 h-full w-[320px] bg-card border-l shadow-lg z-10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold truncate">
          {selectedNode ? 'Pod Group Details' : 'Connection Details'}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedNode && <NodeDetail node={selectedNode} />}
        {selectedEdge && <EdgeDetail edge={selectedEdge} />}
      </div>
    </div>
  );
}

function NodeDetail({ node }: { node: NetworkNodeData }) {
  const labelEntries = Object.entries(node.labels);

  return (
    <>
      {/* Labels */}
      {labelEntries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Selector Labels
          </h4>
          <div className="flex flex-wrap gap-1">
            {labelEntries.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="text-[10px] font-mono font-normal">
                {k}={v}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Policies */}
      {node.policies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Applied Policies ({node.policies.length})
          </h4>
          <div className="space-y-1">
            {node.policies.map((policy) => (
              <div
                key={policy}
                className="rounded-md border px-2.5 py-1.5 text-xs font-medium"
              >
                {policy}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pods */}
      {node.pods.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Box className="h-3 w-3" />
            Pods ({node.pods.length})
          </h4>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {node.pods.map((pod) => (
              <div
                key={pod}
                className="rounded-md border px-2.5 py-1.5 text-xs font-mono truncate"
                title={pod}
              >
                {pod}
              </div>
            ))}
          </div>
        </div>
      )}

      {node.nodeType === 'isolated' && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400">
          These pods are not matched by any NetworkPolicy. They use the default network behavior for the namespace.
        </div>
      )}
    </>
  );
}

function EdgeDetail({ edge }: { edge: EdgeData }) {
  return (
    <>
      {/* Direction */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Connection
        </h4>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="text-[10px] font-mono">
            {edge.from}
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Badge variant="outline" className="text-[10px] font-mono">
            {edge.to}
          </Badge>
        </div>
        <Badge
          variant={edge.direction === 'ingress' ? 'default' : 'secondary'}
          className="text-[10px]"
        >
          {edge.direction}
        </Badge>
      </div>

      {/* Policy */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Source Policy
        </h4>
        <div className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
          {edge.policy}
        </div>
      </div>

      {/* Ports */}
      {edge.ports.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Allowed Ports
          </h4>
          <div className="space-y-1">
            {edge.ports.map((p, i) => (
              <div
                key={i}
                className="rounded-md border px-2.5 py-1.5 text-xs font-mono"
              >
                {p.port || 'All'} / {p.protocol || 'TCP'}
              </div>
            ))}
          </div>
        </div>
      )}

      {edge.ports.length === 0 && (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          All ports are allowed on this connection.
        </div>
      )}
    </>
  );
}
