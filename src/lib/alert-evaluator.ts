import type { AlertRule, AlertEvent, AlertCondition } from '@/types/alert';
import type { WatchEvent, WatchEventObject } from '@/types/watch';

interface EvalResult {
  matched: boolean;
  message: string;
}

/**
 * Parse K8s resource quantities like "100m", "256Mi", "2Gi", "500n" into a base number.
 * CPU: returns cores (e.g. "100m" → 0.1, "2" → 2)
 * Memory: returns bytes (e.g. "256Mi" → 268435456, "1Gi" → 1073741824)
 */
function parseK8sQuantity(quantity: string): number {
  const str = quantity.trim();
  if (!str) return NaN;

  // CPU millicores: "100m" → 0.1
  if (str.endsWith('m')) {
    return parseFloat(str.slice(0, -1)) / 1000;
  }
  // CPU nanocores: "100000000n" → 0.1
  if (str.endsWith('n')) {
    return parseFloat(str.slice(0, -1)) / 1_000_000_000;
  }

  // Memory binary units
  const binaryUnits: Record<string, number> = {
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
  };
  for (const [suffix, multiplier] of Object.entries(binaryUnits)) {
    if (str.endsWith(suffix)) {
      return parseFloat(str.slice(0, -suffix.length)) * multiplier;
    }
  }

  // Memory decimal units
  const decimalUnits: Record<string, number> = {
    k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  };
  for (const [suffix, multiplier] of Object.entries(decimalUnits)) {
    if (str.endsWith(suffix) && !str.endsWith('Mi') && !str.endsWith('Gi')) {
      return parseFloat(str.slice(0, -suffix.length)) * multiplier;
    }
  }

  // Plain number
  return parseFloat(str);
}

function evaluateCondition(condition: AlertCondition, resource: WatchEventObject): EvalResult {
  const { type, operator, value } = condition;

  switch (type) {
    case 'status_change': {
      const statusObj = resource?.status as Record<string, unknown> | undefined;
      const phase = String(statusObj?.phase || '');
      const waitingReasons: string[] = [];
      const csArray = (statusObj?.containerStatuses || []) as Array<Record<string, unknown>>;
      for (const cs of csArray) {
        const state = cs?.state as Record<string, unknown> | undefined;
        const waiting = state?.waiting as Record<string, unknown> | undefined;
        if (waiting?.reason) {
          waitingReasons.push(String(waiting.reason));
        }
      }
      const statusStr = waitingReasons.length > 0
        ? `${phase} (${waitingReasons.join(', ')})`
        : phase;

      if (operator === '==' && statusStr === String(value)) {
        return { matched: true, message: `Status is ${statusStr}` };
      }
      if (operator === 'contains' && statusStr.toLowerCase().includes(String(value).toLowerCase())) {
        return { matched: true, message: `Status "${statusStr}" contains "${value}"` };
      }
      // For waiting reasons, also check individual reasons
      if (operator === '==' && waitingReasons.includes(String(value))) {
        return { matched: true, message: `Container waiting with reason: ${value}` };
      }
      if (operator === 'contains') {
        const matchedReason = waitingReasons.find((r) =>
          r.toLowerCase().includes(String(value).toLowerCase())
        );
        if (matchedReason) {
          return { matched: true, message: `Container waiting reason "${matchedReason}" contains "${value}"` };
        }
      }
      return { matched: false, message: '' };
    }

    case 'restart_count': {
      const statuses = resource?.status as Record<string, unknown> | undefined;
      const containerStatuses = (statuses?.containerStatuses || []) as Array<Record<string, unknown>>;
      const restartCount = containerStatuses.reduce(
        (sum: number, cs: Record<string, unknown>) => sum + (Number(cs?.restartCount) || 0),
        0
      );
      const threshold = Number(value);
      if (operator === '>' && restartCount > threshold) {
        return { matched: true, message: `Restart count ${restartCount} > ${threshold}` };
      }
      if (operator === '<' && restartCount < threshold) {
        return { matched: true, message: `Restart count ${restartCount} < ${threshold}` };
      }
      if (operator === '==' && restartCount === threshold) {
        return { matched: true, message: `Restart count is ${restartCount}` };
      }
      return { matched: false, message: '' };
    }

    case 'cpu_threshold': {
      // Check annotations or resource status for CPU
      const cpuAnnotations = resource?.metadata?.annotations as Record<string, string> | undefined;
      const cpuStatusObj = resource?.status as Record<string, unknown> | undefined;
      const cpuCapacity = cpuStatusObj?.capacity as Record<string, string> | undefined;
      const cpuUsage = cpuAnnotations?.['metrics.k8s.io/cpu'] ||
        cpuCapacity?.cpu || '';
      if (!cpuUsage) return { matched: false, message: '' };
      const cpuNum = parseK8sQuantity(cpuUsage);
      const threshold = parseK8sQuantity(String(value));
      if (isNaN(cpuNum)) return { matched: false, message: '' };
      if (operator === '>' && cpuNum > threshold) {
        return { matched: true, message: `CPU usage ${cpuNum} > ${threshold}` };
      }
      if (operator === '<' && cpuNum < threshold) {
        return { matched: true, message: `CPU usage ${cpuNum} < ${threshold}` };
      }
      if (operator === '==' && cpuNum === threshold) {
        return { matched: true, message: `CPU usage is ${cpuNum}` };
      }
      return { matched: false, message: '' };
    }

    case 'memory_threshold': {
      const memAnnotations = resource?.metadata?.annotations as Record<string, string> | undefined;
      const memStatusObj = resource?.status as Record<string, unknown> | undefined;
      const memCapacity = memStatusObj?.capacity as Record<string, string> | undefined;
      const memUsage = memAnnotations?.['metrics.k8s.io/memory'] ||
        memCapacity?.memory || '';
      if (!memUsage) return { matched: false, message: '' };
      const memNum = parseK8sQuantity(memUsage);
      const threshold = parseK8sQuantity(String(value));
      if (isNaN(memNum)) return { matched: false, message: '' };
      if (operator === '>' && memNum > threshold) {
        return { matched: true, message: `Memory usage ${memNum} > ${threshold}` };
      }
      if (operator === '<' && memNum < threshold) {
        return { matched: true, message: `Memory usage ${memNum} < ${threshold}` };
      }
      if (operator === '==' && memNum === threshold) {
        return { matched: true, message: `Memory usage is ${memNum}` };
      }
      return { matched: false, message: '' };
    }

    case 'event_match': {
      // For K8s Event objects: match reason or message
      const reason = resource?.reason || '';
      const message = resource?.message || '';
      const combined = `${reason} ${message}`;

      if (operator === '==' && (reason === String(value) || message === String(value))) {
        return { matched: true, message: `Event matched: ${reason} - ${message}` };
      }
      if (operator === 'contains' && combined.toLowerCase().includes(String(value).toLowerCase())) {
        return { matched: true, message: `Event "${reason}" contains "${value}": ${message}` };
      }
      return { matched: false, message: '' };
    }

    default:
      return { matched: false, message: '' };
  }
}

export function evaluateRules(
  rules: AlertRule[],
  watchEvent: WatchEvent,
  lastTriggered: Record<string, number>
): AlertEvent[] {
  const now = Date.now();
  const resource = watchEvent.object;
  if (!resource) return [];

  const resourceName = resource.metadata?.name || 'unknown';
  const resourceNamespace = resource.metadata?.namespace;
  const resourceKind = resource.kind || '';

  // Map kind to resourceType for matching
  const kindToType: Record<string, string> = {
    Pod: 'pods',
    Deployment: 'deployments',
    StatefulSet: 'statefulsets',
    DaemonSet: 'daemonsets',
    ReplicaSet: 'replicasets',
    Job: 'jobs',
    CronJob: 'cronjobs',
    Service: 'services',
    Ingress: 'ingresses',
    Event: 'events',
    Node: 'nodes',
    HorizontalPodAutoscaler: 'horizontalpodautoscalers',
    ResourceQuota: 'resourcequotas',
    LimitRange: 'limitranges',
  };

  const resourceType = kindToType[resourceKind] || resourceKind.toLowerCase();

  const alerts: AlertEvent[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Check resource type match
    if (rule.resourceType && rule.resourceType !== resourceType) continue;

    // Check namespace match (if rule specifies namespace)
    if (rule.namespace && rule.namespace !== resourceNamespace) continue;

    // Cooldown check
    const lastTime = lastTriggered[rule.id] || 0;
    if (now - lastTime < rule.cooldown * 1000) continue;

    const result = evaluateCondition(rule.condition, resource);
    if (result.matched) {
      alerts.push({
        id: `${rule.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
        ruleId: rule.id,
        ruleName: rule.name,
        clusterId: rule.clusterId,
        namespace: resourceNamespace,
        resourceType,
        resourceName,
        condition: rule.condition,
        message: result.message,
        timestamp: now,
        read: false,
      });
    }
  }

  return alerts;
}
