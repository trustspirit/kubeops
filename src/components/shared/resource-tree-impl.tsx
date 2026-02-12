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
import { ResourceNode, type ResourceNodeData } from './resource-node';
import { ResourceInfoDrawer } from './resource-info-drawer';
import type { TreeNode, TreeEdge } from '@/hooks/use-resource-tree';

import '@xyflow/react/dist/style.css';

const nodeTypes: NodeTypes = {
  resource: ResourceNode,
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 68;

// Concrete colors for edges - CSS variables don't work inside SVG markers
const EDGE_COLORS = {
  light: { normal: '#6b7280', animated: '#3b82f6' },  // gray-500, blue-500
  dark:  { normal: '#9ca3af', animated: '#60a5fa' },   // gray-400, blue-400
} as const;

function getLayoutedElements(
  treeNodes: TreeNode[],
  treeEdges: TreeEdge[],
  direction: 'LR' | 'TB' = 'LR',
  isDark = false
) {
  const colors = isDark ? EDGE_COLORS.dark : EDGE_COLORS.light;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 30,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  for (const node of treeNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of treeEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = treeNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: 'resource',
      data: node.data,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  const edges: Edge[] = treeEdges.map((edge) => {
    const color = edge.animated ? colors.animated : colors.normal;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: edge.animated ?? false,
      style: {
        stroke: color,
        strokeWidth: edge.animated ? 2 : 1.5,
        opacity: edge.animated ? 0.8 : 0.6,
      },
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
    };
  });

  return { nodes, edges };
}

interface ResourceTreeViewInnerProps {
  treeNodes: TreeNode[];
  treeEdges: TreeEdge[];
  isLoading?: boolean;
  height?: number | string;
  direction?: 'LR' | 'TB';
  className?: string;
  focusNodeId?: string;
  zoomOnScroll?: boolean;
  onInfoClick: (data: ResourceNodeData) => void;
}

function ResourceTreeViewInner({
  treeNodes,
  treeEdges,
  isLoading,
  height = 300,
  direction = 'LR',
  className,
  focusNodeId,
  zoomOnScroll = false,
  onInfoClick,
}: ResourceTreeViewInnerProps) {
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

  // Inject onInfoClick into each node's data
  const nodesWithCallback = useMemo(
    () =>
      treeNodes.map((n) => ({
        ...n,
        data: { ...n.data, onInfoClick },
      })),
    [treeNodes, onInfoClick]
  );

  const isDark = resolvedTheme === 'dark';
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(nodesWithCallback, treeEdges, direction, isDark),
    [nodesWithCallback, treeEdges, direction, isDark]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Track node IDs to detect real layout changes (not just data refreshes)
  const prevNodeIdsRef = useRef('');

  // Sync nodes/edges when layout changes and fitView on structural changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    const nodeIds = layoutedNodes.map((n) => n.id).sort().join(',');
    const changed = nodeIds !== prevNodeIdsRef.current;
    prevNodeIdsRef.current = nodeIds;

    if (changed && layoutedNodes.length > 0) {
      // Delay to let ReactFlow render the new nodes first
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, fitView]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  // Focus on specific node when focusNodeId changes
  useEffect(() => {
    if (focusNodeId && nodes.some((n) => n.id === focusNodeId)) {
      const timer = setTimeout(() => {
        fitView({ nodes: [{ id: focusNodeId }], padding: 0.5, duration: 300 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusNodeId, nodes, fitView]);

  if (isLoading) {
    return (
      <div
        className={`rounded-lg border bg-muted/20 flex items-center justify-center ${className || ''}`}
        style={{ height }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading resource tree...
        </div>
      </div>
    );
  }

  if (treeNodes.length === 0) {
    return (
      <div
        className={`rounded-lg border bg-muted/20 flex items-center justify-center ${className || ''}`}
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">No resources to display</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${className || ''}`} style={{ height }}>
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
        zoomOnScroll={zoomOnScroll}
        preventScrolling={zoomOnScroll}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} className="!shadow-md" />
      </ReactFlow>
    </div>
  );
}

interface ResourceTreeViewProps {
  treeNodes: TreeNode[];
  treeEdges: TreeEdge[];
  isLoading?: boolean;
  height?: number | string;
  direction?: 'LR' | 'TB';
  className?: string;
  focusNodeId?: string;
  zoomOnScroll?: boolean;
}

export function ResourceTreeView(props: ResourceTreeViewProps) {
  const [selectedNode, setSelectedNode] = useState<ResourceNodeData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleInfoClick = useCallback((data: ResourceNodeData) => {
    setSelectedNode(data);
    setDrawerOpen(true);
  }, []);

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) setSelectedNode(null);
  }, []);

  return (
    <ReactFlowProvider>
      <ResourceTreeViewInner {...props} onInfoClick={handleInfoClick} />
      <ResourceInfoDrawer
        node={selectedNode}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />
    </ReactFlowProvider>
  );
}
