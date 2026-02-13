'use client';

import { useParams } from 'next/navigation';
import { useNetworkTopology } from '@/hooks/use-network-topology';
import { NetworkTopologyView } from '@/components/network/network-topology';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldOff } from 'lucide-react';

export default function NetworkTopologyPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data, error, isLoading, mutate } = useNetworkTopology({
    clusterId: decodedClusterId,
    namespace,
  });

  if (isLoading && !data) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  const topoData = data || { podGroups: [], edges: [], isolatedPods: [], defaultDeny: { ingress: false, egress: false } };

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Network Topology</h1>
          <p className="text-sm text-muted-foreground">
            Network policies and traffic flow in {namespace} namespace
            {' · '}{topoData.podGroups.length} group{topoData.podGroups.length !== 1 ? 's' : ''}
            {' · '}{topoData.edges.length} connection{topoData.edges.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {topoData.defaultDeny.ingress && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <ShieldAlert className="h-3 w-3" />
              Default Deny Ingress
            </Badge>
          )}
          {topoData.defaultDeny.egress && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <ShieldAlert className="h-3 w-3" />
              Default Deny Egress
            </Badge>
          )}
          {topoData.isolatedPods.length > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <ShieldOff className="h-3 w-3" />
              {topoData.isolatedPods.length} isolated pod{topoData.isolatedPods.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      <NetworkTopologyView
        data={topoData}
        isLoading={isLoading}
        height="calc(100vh - 220px)"
      />
    </div>
  );
}
