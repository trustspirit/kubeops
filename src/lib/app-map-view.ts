import type { TreeEdge, TreeNode } from '@/hooks/use-resource-tree';

export interface AppMapViewOptions {
  query: string;
  problemsOnly: boolean;
  showNoise: boolean;
}

export interface AppMapSummary {
  total: number;
  healthy: number;
  progressing: number;
  degraded: number;
  unknown: number;
  hiddenNoise: number;
}

export function getConnectedComponentIds(selectedNodeId: string, edges: TreeEdge[]): Set<string> {
  const included = new Set([selectedNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (included.has(edge.source) || included.has(edge.target)) {
        if (!included.has(edge.source)) {
          included.add(edge.source);
          changed = true;
        }
        if (!included.has(edge.target)) {
          included.add(edge.target);
          changed = true;
        }
      }
    }
  }
  return included;
}

function isOperationalNoise(node: TreeNode, connectedNodeIds: Set<string>): boolean {
  if (node.data.kind === 'ReplicaSet' && node.data.status === 'Scaled to 0') return true;
  return node.data.kind === 'Service' && !connectedNodeIds.has(node.id);
}

function connectedNodeIds(edges: TreeEdge[]): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.source);
    ids.add(edge.target);
  }
  return ids;
}

export function summarizeAppMap(nodes: TreeNode[], edges: TreeEdge[]): AppMapSummary {
  const connected = connectedNodeIds(edges);
  const summary: AppMapSummary = {
    total: nodes.length,
    healthy: 0,
    progressing: 0,
    degraded: 0,
    unknown: 0,
    hiddenNoise: 0,
  };

  for (const node of nodes) {
    const key = node.data.health.toLowerCase() as 'healthy' | 'progressing' | 'degraded' | 'unknown';
    summary[key] += 1;
    if (isOperationalNoise(node, connected)) summary.hiddenNoise += 1;
  }
  return summary;
}

function collectIncomingPath(seedIds: Set<string>, edges: TreeEdge[]): Set<string> {
  const included = new Set(seedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (included.has(edge.target) && !included.has(edge.source)) {
        included.add(edge.source);
        changed = true;
      }
    }
  }
  return included;
}

function matchesQuery(node: TreeNode, query: string): boolean {
  const haystack = [node.data.kind, node.data.name, node.data.status, node.data.info]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function deriveAppMapView(
  nodes: TreeNode[],
  edges: TreeEdge[],
  options: AppMapViewOptions,
): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const connected = connectedNodeIds(edges);
  const baseNodes = options.showNoise
    ? nodes
    : nodes.filter((node) => !isOperationalNoise(node, connected));
  const baseIds = new Set(baseNodes.map((node) => node.id));
  const baseEdges = edges.filter((edge) => baseIds.has(edge.source) && baseIds.has(edge.target));
  const query = options.query.trim().toLowerCase();

  if (!query && !options.problemsOnly) {
    return { nodes: baseNodes, edges: baseEdges };
  }

  const seedIds = new Set(
    baseNodes
      .filter((node) => !options.problemsOnly || node.data.health !== 'Healthy')
      .filter((node) => !query || matchesQuery(node, query))
      .map((node) => node.id),
  );
  const visibleIds = collectIncomingPath(seedIds, baseEdges);

  return {
    nodes: baseNodes.filter((node) => visibleIds.has(node.id)),
    edges: baseEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}
