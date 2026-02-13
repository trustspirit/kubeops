'use client';

import { useParams } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { useResourceList } from '@/hooks/use-resource-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AgeDisplay } from '@/components/shared/age-display';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface HpaMetric {
  type: string;
  resource?: {
    name?: string;
    target?: {
      type?: string;
      averageUtilization?: number;
      averageValue?: string;
      value?: string;
    };
  };
  pods?: { metric?: { name?: string }; target?: { averageValue?: string; value?: string } };
  object?: { metric?: { name?: string }; target?: { averageValue?: string; value?: string } };
  external?: { metric?: { name?: string }; target?: { averageValue?: string; value?: string } };
  [key: string]: unknown;
}

interface HpaMetricStatus {
  type: string;
  resource?: {
    name?: string;
    current?: {
      averageUtilization?: number;
      averageValue?: string;
    };
  };
  [key: string]: unknown;
}

interface HpaCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface HpaEvent {
  type?: string;
  reason?: string;
  message?: string;
  lastTimestamp?: string;
  involvedObject?: { kind?: string; name?: string };
  metadata?: { uid?: string; creationTimestamp?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function ReplicaGauge({
  label,
  current,
  min,
  max,
}: {
  label: string;
  current: number;
  min: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {current} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>min: {min}</span>
        <span>max: {max}</span>
      </div>
    </div>
  );
}

function MetricDisplay({ metric, status }: { metric: HpaMetric; status: HpaMetricStatus[] }) {
  const type = metric.type;

  if (type === 'Resource') {
    const resourceName = metric.resource?.name || '-';
    const targetType = metric.resource?.target?.type;
    const targetValue =
      targetType === 'Utilization'
        ? `${metric.resource?.target?.averageUtilization}%`
        : metric.resource?.target?.averageValue || metric.resource?.target?.value || '-';

    // Find matching status metric
    const currentMetric = (status || []).find(
      (s: HpaMetricStatus) => s.type === 'Resource' && s.resource?.name === resourceName
    );
    const currentValue = currentMetric?.resource?.current?.averageUtilization
      ? `${currentMetric.resource.current.averageUtilization}%`
      : currentMetric?.resource?.current?.averageValue || '-';

    return (
      <div className="flex items-center gap-3 rounded-md border p-3">
        <Badge variant="outline" className="text-xs">
          {resourceName}
        </Badge>
        <div className="flex-1 text-sm">
          <span className="font-mono font-medium">{currentValue}</span>
          <span className="text-muted-foreground"> / {targetValue}</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {targetType}
        </Badge>
      </div>
    );
  }

  if (type === 'Pods' || type === 'Object' || type === 'External') {
    const metricKey = type.toLowerCase() as 'pods' | 'object' | 'external';
    const metricSection = metric[metricKey];
    const metricName = metricSection?.metric?.name || '-';
    const targetValue = metricSection?.target?.averageValue ||
      metricSection?.target?.value || '-';

    return (
      <div className="flex items-center gap-3 rounded-md border p-3">
        <Badge variant="outline" className="text-xs">
          {type}: {metricName}
        </Badge>
        <div className="flex-1 text-sm">
          <span className="text-muted-foreground">Target: </span>
          <span className="font-mono font-medium">{targetValue}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm text-muted-foreground">
      Unknown metric type: {type}
    </div>
  );
}

export function HpaDetail() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: hpa } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'horizontalpodautoscalers',
    name,
  });

  const { data: eventsData } = useResourceList({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'events',
  });

  if (!hpa) return null;

  const spec = hpa.spec || {};
  const status = hpa.status || {};
  const scaleTargetRef = spec.scaleTargetRef || {};
  const conditions = status.conditions || [];
  const metrics = spec.metrics || [];
  const currentMetrics = status.currentMetrics || [];

  const currentReplicas = status.currentReplicas || 0;
  const desiredReplicas = status.desiredReplicas || 0;
  const minReplicas = spec.minReplicas || 1;
  const maxReplicas = spec.maxReplicas || 10;

  // Map scaleTargetRef kind to resource type for linking
  const kindToResourceType: Record<string, string> = {
    Deployment: 'deployments',
    StatefulSet: 'statefulsets',
    ReplicaSet: 'replicasets',
  };
  const targetResourceType = kindToResourceType[scaleTargetRef.kind] || scaleTargetRef.kind?.toLowerCase() || '';
  const targetLink = `/clusters/${clusterId}/namespaces/${namespace}/${targetResourceType}/${scaleTargetRef.name}`;

  // HPA scaling events
  const hpaEvents = (eventsData?.items || [])
    .filter((e: HpaEvent) => {
      const obj = e.involvedObject;
      return obj?.kind === 'HorizontalPodAutoscaler' && obj?.name === name;
    })
    .sort(
      (a: HpaEvent, b: HpaEvent) =>
        new Date(b.lastTimestamp || b.metadata?.creationTimestamp || 0).getTime() -
        new Date(a.lastTimestamp || a.metadata?.creationTimestamp || 0).getTime()
    )
    .slice(0, 20);

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Scaling Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ReplicaGauge
              label="Current Replicas"
              current={currentReplicas}
              min={minReplicas}
              max={maxReplicas}
            />
            <ReplicaGauge
              label="Desired Replicas"
              current={desiredReplicas}
              min={minReplicas}
              max={maxReplicas}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Scale Target:</span>
            <Link
              href={targetLink}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
            >
              {scaleTargetRef.kind}/{scaleTargetRef.name}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      {metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Metrics ({metrics.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.map((metric: HpaMetric, i: number) => (
              <MetricDisplay key={i} metric={metric} status={currentMetrics} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-left font-medium">Message</th>
                    <th className="px-3 py-2 text-left font-medium">Last Transition</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((c: HpaCondition, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 font-medium">{c.type}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={c.status === 'True' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono">{c.reason || '-'}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                        {c.message || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <AgeDisplay timestamp={c.lastTransitionTime} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scaling Events */}
      {hpaEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scaling Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hpaEvents.map((event: HpaEvent, i: number) => {
                const isWarning = event.type === 'Warning';
                return (
                  <div
                    key={event.metadata?.uid || i}
                    className={`rounded-md border p-2 text-xs ${
                      isWarning ? 'border-red-500/50 bg-red-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isWarning ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {event.type}
                        </Badge>
                        <span className="font-medium">{event.reason}</span>
                      </div>
                      <AgeDisplay timestamp={event.lastTimestamp || event.metadata?.creationTimestamp} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{event.message}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
