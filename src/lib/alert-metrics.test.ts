import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AlertRule } from '@/types/alert';
import {
  evaluateMetricRules,
  formatCpu,
  formatMemory,
  getMetricResourceTypes,
  parseMetricsList,
  selectMetricRules,
} from './alert-metrics';
import { evaluateRules } from './alert-evaluator';

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    name: 'High CPU',
    enabled: true,
    clusterId: 'dev',
    resourceType: 'pods',
    condition: { type: 'cpu_threshold', operator: '>', value: '500m' },
    cooldown: 60,
    ...overrides,
  };
}

const podMetrics = {
  items: [
    {
      metadata: { name: 'api', namespace: 'prod' },
      containers: [
        { usage: { cpu: '400000000n', memory: '200Mi' } },
        { usage: { cpu: '300m', memory: '56Mi' } },
      ],
    },
    {
      metadata: { name: 'worker', namespace: 'batch' },
      containers: [{ usage: { cpu: '1500m', memory: '2Gi' } }],
    },
    { metadata: { name: 'idle', namespace: 'prod' }, containers: [{ usage: { cpu: '5m', memory: '10Mi' } }] },
  ],
};

describe('metrics list parsing', () => {
  it('sums container usage for pods', () => {
    const samples = parseMetricsList('pods', podMetrics);
    assert.equal(samples.length, 3);
    assert.equal(samples[0].name, 'api');
    assert.equal(samples[0].namespace, 'prod');
    assert.ok(Math.abs(samples[0].cpu - 0.7) < 1e-9);
    assert.equal(samples[0].memory, 256 * 1024 ** 2);
  });

  it('reads node usage directly', () => {
    const samples = parseMetricsList('nodes', {
      items: [{ metadata: { name: 'node-1' }, usage: { cpu: '2500m', memory: '8Gi' } }],
    });
    assert.deepEqual(samples, [
      { resourceType: 'nodes', namespace: undefined, name: 'node-1', cpu: 2.5, memory: 8 * 1024 ** 3 },
    ]);
  });

  it('skips unreadable items instead of reporting them as zero usage', () => {
    assert.deepEqual(parseMetricsList('pods', null), []);
    assert.deepEqual(parseMetricsList('pods', { error: 'metrics API unavailable' }), []);
    assert.deepEqual(parseMetricsList('pods', {
      items: [
        { metadata: { name: 'no-containers' }, containers: [] },
        { metadata: { name: 'bad' }, containers: [{ usage: { cpu: 'lots', memory: '1Mi' } }] },
        { containers: [{ usage: { cpu: '1m', memory: '1Mi' } }] },
      ],
    }), []);
  });
});

describe('metric rule selection', () => {
  it('only polls the lists that enabled usage rules for the cluster need', () => {
    const rules = [
      rule(),
      rule({ id: 'r2', resourceType: 'nodes', condition: { type: 'memory_threshold', operator: '>', value: '1Gi' } }),
      rule({ id: 'r3', clusterId: 'other', resourceType: 'nodes' }),
      rule({ id: 'r4', enabled: false }),
      rule({ id: 'r5', condition: { type: 'restart_count', operator: '>', value: 3 } }),
      rule({ id: 'r6', resourceType: 'deployments' }),
    ];
    assert.deepEqual(getMetricResourceTypes(rules, 'dev'), ['pods', 'nodes']);
    assert.deepEqual(getMetricResourceTypes(rules, 'other'), ['nodes']);
    assert.deepEqual(getMetricResourceTypes(rules, 'none'), []);
    assert.deepEqual(selectMetricRules(rules, 'dev').map((r) => r.id), ['r1', 'r2']);
  });
});

describe('metric rule evaluation', () => {
  const samples = parseMetricsList('pods', podMetrics);

  it('raises one alert per rule naming the worst offender', () => {
    const alerts = evaluateMetricRules([rule()], samples, {}, 1_000_000);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].resourceName, 'worker');
    assert.equal(alerts[0].namespace, 'batch');
    assert.equal(alerts[0].message, 'CPU usage 1.5 > 500m (and 1 more)');
  });

  it('honours the rule namespace and resource type', () => {
    const scoped = evaluateMetricRules([rule({ namespace: 'prod' })], samples, {}, 1_000_000);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].resourceName, 'api');
    assert.equal(scoped[0].message, 'CPU usage 700m > 500m');

    assert.deepEqual(evaluateMetricRules([rule({ resourceType: 'nodes' })], samples, {}, 1_000_000), []);
  });

  it('evaluates memory thresholds and the < operator', () => {
    const memory = evaluateMetricRules(
      [rule({ condition: { type: 'memory_threshold', operator: '>', value: '1Gi' } })],
      samples, {}, 1_000_000,
    );
    assert.equal(memory[0].resourceName, 'worker');
    assert.equal(memory[0].message, 'Memory usage 2Gi > 1Gi');

    const low = evaluateMetricRules(
      [rule({ condition: { type: 'cpu_threshold', operator: '<', value: '10m' } })],
      samples, {}, 1_000_000,
    );
    assert.equal(low[0].resourceName, 'idle');
  });

  it('respects cooldown, disabled rules and thresholds nothing exceeds', () => {
    assert.deepEqual(evaluateMetricRules([rule()], samples, { r1: 990_000 }, 1_000_000), []);
    assert.equal(evaluateMetricRules([rule()], samples, { r1: 900_000 }, 1_000_000).length, 1);
    assert.deepEqual(evaluateMetricRules([rule({ enabled: false })], samples, {}, 1_000_000), []);
    assert.deepEqual(
      evaluateMetricRules([rule({ condition: { type: 'cpu_threshold', operator: '>', value: '8' } })], samples, {}, 1_000_000),
      [],
    );
  });
});

describe('usage rules and the Watch stream', () => {
  it('never fires a CPU or memory rule from node capacity', () => {
    const nodeEvent = {
      type: 'MODIFIED' as const,
      object: {
        kind: 'Node',
        metadata: { name: 'node-1' },
        status: { capacity: { cpu: '8', memory: '32Gi' } },
      },
    };
    const rules = [
      rule({ resourceType: 'nodes', condition: { type: 'cpu_threshold', operator: '>', value: '4' } }),
      rule({ id: 'r2', resourceType: 'nodes', condition: { type: 'memory_threshold', operator: '>', value: '1Gi' } }),
    ];
    assert.deepEqual(evaluateRules(rules, nodeEvent, {}), []);
  });
});

describe('usage formatting', () => {
  it('formats CPU and memory compactly', () => {
    assert.equal(formatCpu(0.25), '250m');
    assert.equal(formatCpu(1), '1');
    assert.equal(formatCpu(1.256), '1.26');
    assert.equal(formatMemory(512 * 1024 ** 2), '512Mi');
    assert.equal(formatMemory(1.5 * 1024 ** 3), '1.5Gi');
    assert.equal(formatMemory(2048), '2Ki');
  });
});
