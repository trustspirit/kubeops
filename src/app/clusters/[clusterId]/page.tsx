'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Server, Box, Layers, Network, HardDrive } from 'lucide-react';
import { useNamespaceStore } from '@/stores/namespace-store';
import Link from 'next/link';

export default function ClusterOverviewPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);

  const { data: health, error: healthError } = useSWR(
    `/api/clusters/${clusterId}/health`
  );
  const { data: nodesData } = useSWR(
    `/api/clusters/${clusterId}/nodes`
  );
  const { data: podsData } = useSWR(
    `/api/clusters/${clusterId}/resources/${namespace}/pods`
  );
  const { data: deploymentsData } = useSWR(
    `/api/clusters/${clusterId}/resources/${namespace}/deployments`
  );
  const { data: servicesData } = useSWR(
    `/api/clusters/${clusterId}/resources/${namespace}/services`
  );

  if (healthError) {
    return <ErrorDisplay error={healthError} />;
  }

  const nodes = nodesData?.items || [];
  const pods = podsData?.items || [];
  const deployments = deploymentsData?.items || [];
  const services = servicesData?.items || [];

  const readyNodes = nodes.filter((n: any) =>
    n.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True')
  );
  const runningPods = pods.filter((p: any) => p.status?.phase === 'Running');

  const stats = [
    { label: 'Nodes', value: `${readyNodes.length}/${nodes.length}`, icon: Server, href: `/clusters/${clusterId}/nodes`, color: 'text-blue-500' },
    { label: 'Pods', value: `${runningPods.length}/${pods.length}`, icon: Box, href: `/clusters/${clusterId}/namespaces/${namespace}/pods`, color: 'text-green-500' },
    { label: 'Deployments', value: deployments.length, icon: Layers, href: `/clusters/${clusterId}/namespaces/${namespace}/deployments`, color: 'text-purple-500' },
    { label: 'Services', value: services.length, icon: Network, href: `/clusters/${clusterId}/namespaces/${namespace}/services`, color: 'text-orange-500' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{decodedClusterId}</h1>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={health?.status === 'connected' ? 'Connected' : 'Error'} />
          <span className="text-sm text-muted-foreground">Namespace: {namespace}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-colors hover:border-primary/50 hover:bg-accent/50 cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
