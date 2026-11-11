import type { AlertCondition, AlertEvent, AlertRule, ConditionType } from '@/types/alert';
import { parseK8sQuantity } from './k8s-quantity';

/**
 * CPU and memory thresholds are about *usage*, which never appears on a Watch
 * event: it only exists in the metrics API (metrics-server). These rules are
 * therefore evaluated by polling that API rather than from the Watch stream.
 */
export const METRIC_POLL_INTERVAL_MS = 60_000;

/** The only resource types the metrics API reports usage for. */
export const METRIC_RESOURCE_TYPES = ['pods', 'nodes'] as const;
export type MetricResourceType = (typeof METRIC_RESOURCE_TYPES)[number];

export function isMetricCondition(type: ConditionType): boolean {
  return type === 'cpu_threshold' || type === 'memory_threshold';
}

export function isMetricResourceType(resourceType: string): resourceType is MetricResourceType {
  return (METRIC_RESOURCE_TYPES as readonly string[]).includes(resourceType);
}

/** Enabled usage rules for a cluster that the metrics API can actually answer. */
export function selectMetricRules(rules: AlertRule[], clusterId: string): AlertRule[] {
  return rules.filter((rule) => (
    rule.enabled
    && rule.clusterId === clusterId
    && isMetricCondition(rule.condition.type)
    && isMetricResourceType(rule.resourceType)
  ));
}

/** Which metrics lists a cluster's rules need fetched, in a stable order. */
export function getMetricResourceTypes(rules: AlertRule[], clusterId: string): MetricResourceType[] {
  const needed = new Set(selectMetricRules(rules, clusterId).map((rule) => rule.resourceType));
  return METRIC_RESOURCE_TYPES.filter((type) => needed.has(type));
}

export interface MetricSample {
  resourceType: MetricResourceType;
  namespace?: string;
  name: string;
  /** CPU usage in cores. */
  cpu: number;
  /** Memory usage in bytes. */
  memory: number;
}

interface UsagePayload {
  cpu?: unknown;
  memory?: unknown;
}

interface MetricsItemPayload {
  metadata?: { name?: unknown; namespace?: unknown };
  usage?: UsagePayload;
  containers?: Array<{ usage?: UsagePayload }>;
}

function quantity(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  return parseK8sQuantity(value);
}

/**
 * Normalizes a `metrics.k8s.io` PodMetricsList / NodeMetricsList.
 *
 * A pod's usage is the sum of its containers. Items whose usage cannot be read
 * are skipped rather than reported as zero, which would trip every `<` rule.
 */
export function parseMetricsList(resourceType: MetricResourceType, payload: unknown): MetricSample[] {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];

  const samples: MetricSample[] = [];
  for (const item of items as MetricsItemPayload[]) {
    const name = item?.metadata?.name;
    if (typeof name !== 'string' || !name) continue;

    let cpu: number;
    let memory: number;
    if (resourceType === 'pods') {
      const containers = Array.isArray(item.containers) ? item.containers : [];
      if (containers.length === 0) continue;
      cpu = containers.reduce((sum, c) => sum + quantity(c?.usage?.cpu), 0);
      memory = containers.reduce((sum, c) => sum + quantity(c?.usage?.memory), 0);
    } else {
      cpu = quantity(item.usage?.cpu);
      memory = quantity(item.usage?.memory);
    }
    if (!Number.isFinite(cpu) || !Number.isFinite(memory)) continue;

    const namespace = item.metadata?.namespace;
    samples.push({
      resourceType,
      namespace: typeof namespace === 'string' && namespace ? namespace : undefined,
      name,
      cpu,
      memory,
    });
  }
  return samples;
}

function trimNumber(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

export function formatCpu(cores: number): string {
  if (cores < 1) return `${trimNumber(cores * 1000, 0)}m`;
  return trimNumber(cores, 2);
}

export function formatMemory(bytes: number): string {
  const gi = 1024 ** 3;
  const mi = 1024 ** 2;
  if (bytes >= gi) return `${trimNumber(bytes / gi, 2)}Gi`;
  if (bytes >= mi) return `${trimNumber(bytes / mi, 0)}Mi`;
  return `${trimNumber(bytes / 1024, 0)}Ki`;
}

function matches(operator: AlertCondition['operator'], usage: number, threshold: number): boolean {
  if (operator === '>') return usage > threshold;
  if (operator === '<') return usage < threshold;
  if (operator === '==') return usage === threshold;
  return false;
}

/**
 * Evaluates usage rules against one poll's worth of samples.
 *
 * A poll sees every pod at once, so a rule can match many resources in the same
 * instant. Cooldown is per rule, so each rule raises at most one alert per
 * poll: the most extreme offender, with a count of the others.
 */
export function evaluateMetricRules(
  rules: AlertRule[],
  samples: MetricSample[],
  lastTriggered: Record<string, number>,
  now: number = Date.now(),
): AlertEvent[] {
  const alerts: AlertEvent[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { type, operator, value } = rule.condition;
    if (!isMetricCondition(type)) continue;

    const lastTime = lastTriggered[rule.id] || 0;
    if (now - lastTime < rule.cooldown * 1000) continue;

    const threshold = parseK8sQuantity(String(value));
    if (!Number.isFinite(threshold)) continue;

    const isCpu = type === 'cpu_threshold';
    const usageOf = (sample: MetricSample) => (isCpu ? sample.cpu : sample.memory);

    const offenders = samples.filter((sample) => (
      sample.resourceType === rule.resourceType
      && (!rule.namespace || sample.namespace === rule.namespace)
      && matches(operator, usageOf(sample), threshold)
    ));
    if (offenders.length === 0) continue;

    const worst = offenders.reduce((best, sample) => {
      const further = operator === '<' ? usageOf(sample) < usageOf(best) : usageOf(sample) > usageOf(best);
      return further ? sample : best;
    });

    const format = isCpu ? formatCpu : formatMemory;
    const label = isCpu ? 'CPU' : 'Memory';
    const comparison = operator === '==' ? 'is' : operator;
    const others = offenders.length - 1;
    const suffix = others > 0 ? ` (and ${others} more)` : '';

    alerts.push({
      id: `${rule.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      clusterId: rule.clusterId,
      namespace: worst.namespace,
      resourceType: rule.resourceType,
      resourceName: worst.name,
      condition: rule.condition,
      message: `${label} usage ${format(usageOf(worst))} ${comparison} ${format(threshold)}${suffix}`,
      timestamp: now,
      read: false,
    });
  }

  return alerts;
}
