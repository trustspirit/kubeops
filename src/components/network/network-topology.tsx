'use client';

import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionLineType,
  type ColorMode,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import dagre from 'dagre';
import { NetworkTopologyNode, type NetworkNodeData } from './network-topology-node';
import { NetworkTopologyDetail } from './network-topology-detail';
import type { NetworkTopologyData, PodGroupData, EdgeData } from '@/hooks/use-network-topology';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';

import '@xyflow/react/dist/style.css';

const nodeTypes: NodeTypes = {
  networkGroup: NetworkTopologyNode,
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 90;

const EDGE_COLORS = {
  light: { allowed: '#22c55e', default: '#6b7280' },
  dark: { allowed: '#4ade80', default: '#9ca3af' },
} as const;

function getLayoutedElements(
  topoData: NetworkTopologyData,
  direction: 'LR' | 'TB' = 'LR',
  isDark = false,
  searchFilter = '',
  policyFilter = '',
) {
  const colors = isDark ? EDGE_COLORS.dark : EDGE_COLORS.light;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 100,
    marginx: 20,
    marginy: 20,
  });

  // Filter logic
  const matchesSearch = (group: PodGroupData) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    // Search by pod name or label
    if (group.pods.some((p) => p.toLowerCase().includes(q))) return true;
    if (Object.entries(group.labels).some(([k, v]) => `${k}=${v}`.toLowerCase().includes(q)))
      return true;
    if (group.id.toLowerCase().includes(q)) return true;
    return false;
  };

  const matchesPolicy = (group: PodGroupData) => {
    if (!policyFilter) return true;
    return group.policies.includes(policyFilter);
  };

  // Determine node type
  const getNodeType = (group: PodGroupData): NetworkNodeData['nodeType'] => {
    if (group.id === 'external') return 'external';
    if (group.id === 'any') return 'any';
    if (group.id === 'external-namespace') return 'namespace';
    return 'group';
  };

  // Build nodes from pod groups
  const filteredGroupIds = new Set<string>();
  for (const group of topoData.podGroups) {
    if (!matchesSearch(group) || !matchesPolicy(group)) continue;

    filteredGroupIds.add(group.id);
    const nodeType = getNodeType(group);

    g.setNode(group.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: group.id,
      type: 'networkGroup',
      position: { x: 0, y: 0 },
      data: {
        groupId: group.id,
        labels: group.labels,
        podCount: group.pods.length,
        policyCount: group.policies.length,
        pods: group.pods,
        policies: group.policies,
        nodeType,
      } satisfies NetworkNodeData,
    });
  }

  // Add isolated pods as a single node if any
  if (topoData.isolatedPods.length > 0) {
    const isolatedId = 'isolated-pods';
    const matchesIsolatedSearch =
      !searchFilter ||
      topoData.isolatedPods.some((p) => p.toLowerCase().includes(searchFilter.toLowerCase()));

    if (matchesIsolatedSearch && !policyFilter) {
      filteredGroupIds.add(isolatedId);
      g.setNode(isolatedId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: isolatedId,
        type: 'networkGroup',
        position: { x: 0, y: 0 },
        data: {
          groupId: isolatedId,
          labels: {},
          podCount: topoData.isolatedPods.length,
          policyCount: 0,
          pods: topoData.isolatedPods,
          policies: [],
          nodeType: 'isolated',
        } satisfies NetworkNodeData,
      });
    }
  }

  // Build edges
  for (const edge of topoData.edges) {
    // Only include edges where both source and target are in filtered groups
    if (!filteredGroupIds.has(edge.from) || !filteredGroupIds.has(edge.to)) continue;

    // Policy filter on edges
    if (policyFilter && edge.policy !== policyFilter) continue;

    const edgeId = `${edge.from}-${edge.direction}-${edge.to}-${edge.policy}`;
    const portLabel = edge.ports.length > 0
      ? edge.ports.map((p) => `${p.port || '*'}/${p.protocol || 'TCP'}`).join(', ')
      : 'all ports';

    g.setEdge(edge.from, edge.to);
    edges.push({
      id: edgeId,
      source: edge.from,
      target: edge.to,
      label: portLabel,
      animated: true,
      style: {
        stroke: colors.allowed,
        strokeWidth: 2,
        opacity: 0.8,
      },
      type: 'smoothstep',
      labelStyle: {
        fill: isDark ? '#a3a3a3' : '#525252',
        fontSize: 9,
        fontFamily: 'monospace',
      },
      labelBgStyle: {
        fill: isDark ? '#1e1e2e' : '#ffffff',
        fillOpacity: 0.85,
      },
      labelBgPadding: [4, 2] as [number, number],
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: colors.allowed,
      },
      data: edge,
    });
  }

  // Ensure edges reference existing nodes only
  const existingNodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => existingNodeIds.has(e.source) && existingNodeIds.has(e.target)
  );

  // Apply layout
  if (nodes.length > 0) {
    dagre.layout(g);

    for (const node of nodes) {
      const pos = g.node(node.id);
      if (pos) {
        node.position = {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        };
      }
    }
  }

  return { nodes, edges: validEdges };
}

// === Inner component (inside ReactFlowProvider) ===

interface NetworkTopologyInnerProps {
  data: NetworkTopologyData;
  isLoading?: boolean;
  height?: number | string;
  className?: string;
  onNodeSelect: (data: NetworkNodeData | null) => void;
  onEdgeSelect: (data: EdgeData | null) => void;
}

function NetworkTopologyInner({
  data: topoData,
  isLoading,
  height = 500,
  className,
  onNodeSelect,
  onEdgeSelect,
}: NetworkTopologyInnerProps) {
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const isDark = resolvedTheme === 'dark';

  const [searchFilter, setSearchFilter] = useState('');
  const [policyFilter, setPolicyFilter] = useState('');

  // Collect all policies for the filter dropdown
  const allPolicies = useMemo(() => {
    const policies = new Set<string>();
    for (const group of topoData.podGroups) {
      for (const policy of group.policies) {
        policies.add(policy);
      }
    }
    return Array.from(policies).sort();
  }, [topoData.podGroups]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(topoData, 'LR', isDark, searchFilter, policyFilter),
    [topoData, isDark, searchFilter, policyFilter]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  const prevNodeIdsRef = useRef('');

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    const nodeIds = layoutedNodes.map((n) => n.id).sort().join(',');
    const changed = nodeIds !== prevNodeIdsRef.current;
    prevNodeIdsRef.current = nodeIds;

    if (changed && layoutedNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, fitView]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onEdgeSelect(null);
      onNodeSelect(node.data as unknown as NetworkNodeData);
    },
    [onNodeSelect, onEdgeSelect]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onNodeSelect(null);
      onEdgeSelect(edge.data as unknown as EdgeData);
    },
    [onNodeSelect, onEdgeSelect]
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
    onEdgeSelect(null);
  }, [onNodeSelect, onEdgeSelect]);

  if (isLoading) {
    return (
      <div
        className={`rounded-lg border bg-muted/20 flex items-center justify-center ${className || ''}`}
        style={{ height }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading network topology...
        </div>
      </div>
    );
  }

  if (topoData.podGroups.length === 0 && topoData.isolatedPods.length === 0) {
    return (
      <div
        className={`rounded-lg border bg-muted/20 flex items-center justify-center ${className || ''}`}
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">
          No network policies found in this namespace.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search pods, labels..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={policyFilter} onValueChange={(v) => setPolicyFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All Policies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All Policies</SelectItem>
              {allPolicies.map((policy) => (
                <SelectItem key={policy} value={policy} className="text-xs">
                  {policy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="rounded-lg border overflow-hidden" style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          colorMode={colorMode}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={proOptions}
          zoomOnScroll
          preventScrolling
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} className="!shadow-md" />
        </ReactFlow>
      </div>
    </div>
  );
}

// === Outer component ===

interface NetworkTopologyViewProps {
  data: NetworkTopologyData;
  isLoading?: boolean;
  height?: number | string;
  className?: string;
}

export function NetworkTopologyView(props: NetworkTopologyViewProps) {
  const [selectedNode, setSelectedNode] = useState<NetworkNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeData | null>(null);

  const handleClose = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  return (
    <div className="relative">
      <ReactFlowProvider>
        <NetworkTopologyInner
          {...props}
          onNodeSelect={setSelectedNode}
          onEdgeSelect={setSelectedEdge}
        />
      </ReactFlowProvider>
      <NetworkTopologyDetail
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        onClose={handleClose}
      />
    </div>
  );
}
