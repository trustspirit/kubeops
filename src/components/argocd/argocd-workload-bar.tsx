'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { GitBranch, Settings2, X, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArgoCDActionButtons } from '@/components/argocd/argocd-action-buttons';
import { useSettingsStore } from '@/stores/settings-store';
import {
  ARGOCD_APPLICATIONS_PLURAL,
  ARGOCD_GROUP,
  ARGOCD_VERSION,
  getArgoCDAppHref,
  type ArgoCDApplication,
} from '@/lib/argocd/helpers';
import {
  findWorkloadArgoCDApp,
  getWorkloadArgoCDCandidates,
  hasArgoCDSpecificCandidate,
  type ArgoCDHostApps,
} from '@/lib/argocd/workload-app';
import type { KubeResource } from '@/types/resource';
import type { ClusterInfo } from '@/lib/k8s/types';

interface ArgoCDWorkloadBarProps {
  /** Decoded cluster id the workload runs in. */
  clusterId: string;
  namespace?: string;
  /** The workload and its owner chain (pod, ReplicaSet, Deployment …). */
  resources: Array<Pick<KubeResource, 'metadata'> | null | undefined>;
}

interface HostLookup {
  hosts: ArgoCDHostApps[];
  /** Hosts that could not be read (not 404 — that just means no Argo CD there). */
  failed: Array<{ clusterId: string; message: string }>;
}

async function listHostApps(hostIds: string[]): Promise<HostLookup> {
  const results = await Promise.allSettled(hostIds.map((hostClusterId) =>
    apiClient.get<{ items?: ArgoCDApplication[] }>(
      `/api/clusters/${encodeURIComponent(hostClusterId)}/crds/${ARGOCD_GROUP}/${ARGOCD_VERSION}/${ARGOCD_APPLICATIONS_PLURAL}`,
    ),
  ));
  const lookup: HostLookup = { hosts: [], failed: [] };
  results.forEach((result, index) => {
    const hostClusterId = hostIds[index];
    if (result.status === 'fulfilled') {
      lookup.hosts.push({ hostClusterId, apps: result.value.items || [] });
      return;
    }
    const err = result.reason as Error & { status?: number };
    // No Application CRD on that cluster: Argo CD simply is not there.
    if (err?.status === 404) {
      lookup.hosts.push({ hostClusterId, apps: [] });
      return;
    }
    lookup.failed.push({ clusterId: hostClusterId, message: err?.message || 'Request failed' });
  });
  return lookup;
}

/**
 * Shows the Argo CD Application that manages a workload — on this cluster or a
 * central Argo CD cluster the user picked — with Refresh / Hard Refresh, so a
 * stale app can be refreshed without first finding it in the Argo CD list.
 */
export function ArgoCDWorkloadBar({ clusterId, namespace, resources }: ArgoCDWorkloadBarProps) {
  const hostClusters = useSettingsStore((s) => s.argoCDHostClusters);
  const addHost = useSettingsStore((s) => s.addArgoCDHostCluster);
  const removeHost = useSettingsStore((s) => s.removeArgoCDHostCluster);
  const [manageOpen, setManageOpen] = useState(false);

  const candidates = useMemo(() => getWorkloadArgoCDCandidates(resources), [resources]);
  const hostIds = useMemo(
    () => [clusterId, ...hostClusters.filter((id) => id !== clusterId)],
    [clusterId, hostClusters],
  );

  const { data: lookup, mutate } = useSWR(
    candidates.length > 0 ? ['argocd-workload-hosts', ...hostIds] : null,
    () => listHostApps(hostIds),
    { refreshInterval: 30000 },
  );
  const { data: clustersData } = useSWR<{ clusters: ClusterInfo[] }>(
    candidates.length > 0 ? '/api/clusters' : null,
  );
  const clusters = useMemo(() => clustersData?.clusters ?? [], [clustersData]);

  const match = useMemo(() => {
    if (!lookup) return null;
    return findWorkloadArgoCDApp({
      workloadClusterId: clusterId,
      workloadNamespace: namespace,
      workloadServer: clusters.find((c) => c.name === clusterId)?.server,
      candidates,
      hosts: lookup.hosts,
    });
  }, [lookup, clusterId, namespace, clusters, candidates]);

  if (candidates.length === 0 || !lookup) return null;
  // A bare Helm `app.kubernetes.io/instance` label is not evidence of Argo CD;
  // stay quiet unless something Argo-specific points at an app.
  if (!match && !hasArgoCDSpecificCandidate(candidates)) return null;

  const remote = match && match.hostClusterId !== clusterId;
  const selectableHosts = clusters.filter((c) => c.name !== clusterId && !hostClusters.includes(c.name));

  const hostManager = (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Argo CD clusters</p>
        <p className="text-xs text-muted-foreground">
          Clusters running a central Argo CD. Workload pages look up their Application there too.
        </p>
      </div>
      {hostClusters.length > 0 && (
        <ul className="space-y-1">
          {hostClusters.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs font-mono">
              <span className="truncate" title={id}>{id}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeHost(id)} aria-label={`Remove ${id}`}>
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Select value="" onValueChange={(id) => { if (id) addHost(id); }}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Add a cluster…" />
        </SelectTrigger>
        <SelectContent>
          {selectableHosts.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No other clusters</div>
          )}
          {selectableHosts.map((c) => (
            <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const manageButton = (label?: string) => (
    <Popover open={manageOpen} onOpenChange={setManageOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" aria-label="Choose Argo CD clusters">
          <Settings2 className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">{hostManager}</PopoverContent>
    </Popover>
  );

  if (!match) {
    const searched = hostIds.join(', ');
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <GitBranch className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Argo CD app <span className="font-mono text-foreground">{candidates[0].name}</span> was not found in{' '}
          <span className="font-mono">{searched}</span>.
          {lookup.failed.length > 0 && ` Could not read ${lookup.failed.map((f) => f.clusterId).join(', ')}.`}
          {' '}If Argo CD runs on another cluster, add it.
        </span>
        {manageButton('Choose Argo CD cluster')}
      </div>
    );
  }

  const sync = match.app.status?.sync?.status;
  const health = match.app.status?.health?.status;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Argo CD</span>
      <Link
        href={getArgoCDAppHref(encodeURIComponent(match.hostClusterId), match.name, match.namespace)}
        className="font-medium text-primary hover:underline"
      >
        {match.name}
      </Link>
      {remote && (
        <Badge variant="outline" className="text-xs font-mono font-normal" title="Cluster the Argo CD Application lives on">
          on {match.hostClusterId}
        </Badge>
      )}
      {sync && <StatusBadge status={sync} />}
      {health && <StatusBadge status={health} />}
      {match.ambiguous && (
        <span className="inline-flex items-center gap-1 text-xs text-yellow-600" title="Another Application matched equally well">
          <AlertTriangle className="h-3.5 w-3.5" />ambiguous
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <ArgoCDActionButtons
          clusterId={match.hostClusterId}
          appName={match.name}
          namespace={match.namespace}
          refreshOnly
          onChanged={() => { void mutate(); }}
        />
        {manageButton()}
      </div>
    </div>
  );
}
