'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Box, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface WorkloadHealthSummaryProps {
  clusterId: string;
  namespace: string;
  pods: any[];
  deployments: any[];
  statefulsets: any[];
  daemonsets: any[];
  events: any[];
}

export function WorkloadHealthSummary({
  clusterId,
  namespace,
  pods,
  deployments,
  statefulsets,
  daemonsets,
  events,
}: WorkloadHealthSummaryProps) {
  const { failingCount, nonReadyCount, totalRestarts, warningCount, allHealthy } = useMemo(() => {
    const oneHourAgo = Date.now() - 3600_000;

    // 1. Failing Pods: CrashLoopBackOff, Error, ImagePullBackOff
    const failingCount = pods.filter((p: any) => {
      const statuses = p.status?.containerStatuses || [];
      return statuses.some((cs: any) => {
        const waitingReason = cs.state?.waiting?.reason;
        return ['CrashLoopBackOff', 'Error', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError'].includes(waitingReason);
      });
    }).length;

    // 2. Non-Ready Workloads
    const nonReadyDeploys = deployments.filter((d: any) =>
      (d.status?.readyReplicas || 0) < (d.spec?.replicas || 1)
    ).length;
    const nonReadySts = statefulsets.filter((s: any) =>
      (s.status?.readyReplicas || 0) < (s.spec?.replicas || 1)
    ).length;
    const nonReadyDs = daemonsets.filter((d: any) =>
      (d.status?.numberReady || 0) < (d.status?.desiredNumberScheduled || 1)
    ).length;
    const nonReadyCount = nonReadyDeploys + nonReadySts + nonReadyDs;

    // 3. Total restart count across all pods (K8s only provides cumulative restartCount)
    const totalRestarts = pods.reduce((sum: number, p: any) => {
      const statuses = p.status?.containerStatuses || [];
      return sum + statuses.reduce((s: number, c: any) => s + (c.restartCount || 0), 0);
    }, 0);

    // 4. Warning Events in last hour
    const warningCount = events.filter((e: any) =>
      e.type === 'Warning' &&
      new Date(e.lastTimestamp || e.metadata?.creationTimestamp).getTime() > oneHourAgo
    ).length;

    const allHealthy = failingCount === 0 && nonReadyCount === 0 && totalRestarts === 0 && warningCount === 0;

    return { failingCount, nonReadyCount, totalRestarts, warningCount, allHealthy };
  }, [pods, deployments, statefulsets, daemonsets, events]);

  if (allHealthy) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-green-500" />
        <span className="text-sm font-medium text-green-700 dark:text-green-400">All workloads healthy</span>
      </div>
    );
  }

  const cards = [
    {
      label: 'Failing Pods',
      count: failingCount,
      icon: AlertCircle,
      href: `/clusters/${clusterId}/namespaces/${namespace}/pods`,
      color: failingCount > 0 ? 'text-red-500' : 'text-green-500',
      bg: failingCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10',
    },
    {
      label: 'Non-Ready Workloads',
      count: nonReadyCount,
      icon: Box,
      href: `/clusters/${clusterId}/namespaces/${namespace}/deployments`,
      color: nonReadyCount > 0 ? 'text-red-500' : 'text-green-500',
      bg: nonReadyCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10',
    },
    {
      label: 'Restarts',
      count: totalRestarts,
      icon: RefreshCw,
      href: `/clusters/${clusterId}/namespaces/${namespace}/pods`,
      color: totalRestarts > 0 ? 'text-amber-500' : 'text-green-500',
      bg: totalRestarts > 0 ? 'bg-amber-500/10' : 'bg-green-500/10',
    },
    {
      label: 'Warning Events',
      count: warningCount,
      icon: AlertTriangle,
      href: `/clusters/${clusterId}/namespaces/${namespace}/events`,
      color: warningCount > 0 ? 'text-amber-500' : 'text-green-500',
      bg: warningCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10',
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link key={card.label} href={card.href}>
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/50 cursor-pointer">
              <CardContent className="flex items-center gap-3 p-3">
                <div className={`rounded-lg p-2 ${card.bg}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-tight">{card.count}</p>
                  <p className="text-[11px] text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
