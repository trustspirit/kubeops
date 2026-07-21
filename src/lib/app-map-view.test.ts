import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveAppMapView, getConnectedComponentIds, summarizeAppMap } from './app-map-view';
import type { TreeEdge, TreeNode } from '@/hooks/use-resource-tree';

function node(
  id: string,
  kind: string,
  health: TreeNode['data']['health'] = 'Healthy',
  status = 'Healthy',
): TreeNode {
  return {
    id,
    data: { kind, name: id.split('/')[1], health, status },
  };
}

const nodes: TreeNode[] = [
  node('Ingress/web', 'Ingress'),
  node('Service/web', 'Service'),
  node('Deployment/web', 'Deployment'),
  node('ReplicaSet/web-new', 'ReplicaSet'),
  node('Pod/web-new-a', 'Pod', 'Degraded', 'CrashLoopBackOff'),
  node('ReplicaSet/web-old', 'ReplicaSet', 'Healthy', 'Scaled to 0'),
  node('Service/orphan', 'Service'),
];

const edges: TreeEdge[] = [
  { id: 'ing-svc', source: 'Ingress/web', target: 'Service/web' },
  { id: 'svc-dep', source: 'Service/web', target: 'Deployment/web' },
  { id: 'dep-rs', source: 'Deployment/web', target: 'ReplicaSet/web-new' },
  { id: 'rs-pod', source: 'ReplicaSet/web-new', target: 'Pod/web-new-a' },
];

describe('summarizeAppMap', () => {
  it('counts health states and operational noise', () => {
    assert.deepEqual(summarizeAppMap(nodes, edges), {
      total: 7,
      healthy: 6,
      progressing: 0,
      degraded: 1,
      unknown: 0,
      hiddenNoise: 2,
    });
  });
});

describe('deriveAppMapView', () => {
  it('hides inactive ReplicaSets and unconnected Services by default', () => {
    const result = deriveAppMapView(nodes, edges, {
      query: '',
      problemsOnly: false,
      showNoise: false,
    });

    assert.deepEqual(result.nodes.map((item) => item.id), [
      'Ingress/web',
      'Service/web',
      'Deployment/web',
      'ReplicaSet/web-new',
      'Pod/web-new-a',
    ]);
  });

  it('restores operational noise on request', () => {
    const result = deriveAppMapView(nodes, edges, {
      query: '',
      problemsOnly: false,
      showNoise: true,
    });

    assert.equal(result.nodes.length, nodes.length);
  });

  it('keeps the full incoming path when showing problems', () => {
    const result = deriveAppMapView(nodes, edges, {
      query: '',
      problemsOnly: true,
      showNoise: false,
    });

    assert.deepEqual(result.nodes.map((item) => item.id), [
      'Ingress/web',
      'Service/web',
      'Deployment/web',
      'ReplicaSet/web-new',
      'Pod/web-new-a',
    ]);
    assert.equal(result.edges.length, 4);
  });

  it('searches names and status while keeping their incoming paths', () => {
    const result = deriveAppMapView(nodes, edges, {
      query: 'crashloop',
      problemsOnly: false,
      showNoise: false,
    });

    assert.equal(result.nodes.at(-1)?.id, 'Pod/web-new-a');
    assert.equal(result.nodes.length, 5);
  });
});

describe('getConnectedComponentIds', () => {
  it('finds the complete path around a selected node without including unrelated resources', () => {
    assert.deepEqual(
      [...getConnectedComponentIds('Deployment/web', edges)].sort(),
      [
        'Deployment/web',
        'Ingress/web',
        'Pod/web-new-a',
        'ReplicaSet/web-new',
        'Service/web',
      ].sort(),
    );
    assert.equal(getConnectedComponentIds('Deployment/web', edges).has('Service/orphan'), false);
  });
});
