'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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

function getLayoutedElements(
  treeNodes: TreeNode[],
  treeEdges: TreeEdge[],
  direction: 'LR' | 'TB' = 'LR'
) {
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

  const edges: Edge[] = treeEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.animated ?? false,
    style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5, opacity: 0.5 },
    type: 'smoothstep',
  }));

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

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(nodesWithCallback, treeEdges, direction),
    [nodesWithCallback, treeEdges, direction]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

  // Update when layouted elements change
  const currentNodes = layoutedNodes.length !== nodes.length ? layoutedNodes : nodes;
  const currentEdges = layoutedEdges.length !== edges.length ? layoutedEdges : edges;

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  // Focus on specific node when focusNodeId changes
  useEffect(() => {
    if (focusNodeId && currentNodes.some((n) => n.id === focusNodeId)) {
      // Small delay to let ReactFlow render first
      const timer = setTimeout(() => {
        fitView({ nodes: [{ id: focusNodeId }], padding: 0.5, duration: 300 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusNodeId, currentNodes, fitView]);

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
        nodes={currentNodes}
        edges={currentEdges}
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
