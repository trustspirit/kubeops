'use client';

import { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { AgeDisplay } from '@/components/shared/age-display';
import { Badge } from '@/components/ui/badge';
import type { KubeResource, KubePod, KubeDeployment, ContainerStatus } from '@/types/resource';
import type { HelmRelease } from '@/types/helm';

const nsCol: ColumnDef<KubeResource> = {
  accessorFn: (row) => row.metadata?.namespace,
  id: 'namespace',
  header: 'Namespace',
  cell: ({ row }) => (
    <Badge variant="outline" className="font-normal text-xs">
      {row.original.metadata?.namespace}
    </Badge>
  ),
};

function getPodStatus(pod: KubeResource): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  return (pod.status as KubePod['status'])?.phase || 'Unknown';
}

function getPodRestarts(pod: KubeResource): number {
  const statuses = ((pod.status as KubePod['status'])?.containerStatuses || []) as ContainerStatus[];
  return statuses.reduce(
    (sum: number, cs: ContainerStatus) => sum + (cs.restartCount || 0),
    0
  );
}

function getReadyContainers(pod: KubeResource): string {
  const status = pod.status as KubePod['status'];
  const spec = pod.spec as KubePod['spec'];
  const statuses = (status?.containerStatuses || []) as ContainerStatus[];
  const ready = statuses.filter((cs: ContainerStatus) => cs.ready).length;
  return `${ready}/${statuses.length || spec?.containers?.length || 0}`;
}

function getDeploymentReady(dep: KubeResource): string {
  const status = dep.status as KubeDeployment['status'];
  const spec = dep.spec as KubeDeployment['spec'];
  const ready = status?.readyReplicas || 0;
  const desired = spec?.replicas || 0;
  return `${ready}/${desired}`;
}

export const podColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={getPodStatus(row.original)} /> },
  { id: 'ready', header: 'Ready', cell: ({ row }) => getReadyContainers(row.original) },
  { id: 'restarts', header: 'Restarts', cell: ({ row }) => getPodRestarts(row.original) },
  { id: 'node', header: 'Node', cell: ({ row }) => (row.original.spec as KubePod['spec'])?.nodeName || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const deploymentColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'ready', header: 'Ready', cell: ({ row }) => getDeploymentReady(row.original) },
  { id: 'upToDate', header: 'Up-to-date', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.updatedReplicas || 0 },
  { id: 'available', header: 'Available', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.availableReplicas || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const serviceColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => {
    const type = (row.original.spec as Record<string, unknown>)?.type as string || 'ClusterIP';
    return <Badge variant={type === 'LoadBalancer' ? 'default' : type === 'NodePort' ? 'secondary' : 'outline'} className="text-xs font-mono">{type}</Badge>;
  }},
  { id: 'clusterIP', header: 'Cluster IP', cell: ({ row }) => <span className="font-mono text-xs">{(row.original.spec as Record<string, unknown>)?.clusterIP as string || '-'}</span> },
  { id: 'externalIP', header: 'External IP', cell: ({ row }) => {
    const svc = row.original;
    const status = svc.status as Record<string, unknown>;
    const spec = svc.spec as Record<string, unknown>;
    const lb = status?.loadBalancer as Record<string, unknown> | undefined;
    const lbIngress = lb?.ingress as Array<Record<string, string>> | undefined;
    if (lbIngress?.length) return <span className="font-mono text-xs">{lbIngress[0].hostname || lbIngress[0].ip || '-'}</span>;
    const externalIPs = spec?.externalIPs as string[] | undefined;
    if (externalIPs?.length) return <span className="font-mono text-xs">{externalIPs.join(', ')}</span>;
    return <span className="text-muted-foreground">-</span>;
  }},
  { id: 'ports', header: 'Ports', cell: ({ row }) => {
    const ports = ((row.original.spec as Record<string, unknown>)?.ports || []) as Array<Record<string, unknown>>;
    return <span className="font-mono text-xs">{ports.map((p) => {
      let s = `${p.port}`;
      if (p.nodePort) s += `:${p.nodePort}`;
      s += `/${p.protocol || 'TCP'}`;
      return s;
    }).join(', ') || '-'}</span>;
  }},
  { id: 'selector', header: 'Selector', cell: ({ row }) => {
    const sel = ((row.original.spec as Record<string, unknown>)?.selector || {}) as Record<string, string>;
    const entries = Object.entries(sel);
    if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
    return <span className="text-xs font-mono truncate max-w-[200px] block">{entries.map(([k, v]) => `${k}=${v}`).join(', ')}</span>;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const statefulsetColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'ready', header: 'Ready', cell: ({ row }) => `${(row.original.status as Record<string, unknown>)?.readyReplicas || 0}/${(row.original.spec as Record<string, unknown>)?.replicas || 0}` },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const daemonsetColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'desired', header: 'Desired', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.desiredNumberScheduled || 0 },
  { id: 'current', header: 'Current', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.currentNumberScheduled || 0 },
  { id: 'ready', header: 'Ready', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.numberReady || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const replicasetColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'desired', header: 'Desired', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.replicas || 0 },
  { id: 'current', header: 'Current', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.replicas || 0 },
  { id: 'ready', header: 'Ready', cell: ({ row }) => (row.original.status as Record<string, unknown>)?.readyReplicas || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const jobColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'completions', header: 'Completions', cell: ({ row }) => `${(row.original.status as Record<string, unknown>)?.succeeded || 0}/${(row.original.spec as Record<string, unknown>)?.completions || 1}` },
  { id: 'status', header: 'Status', cell: ({ row }) => {
    const status = row.original.status as Record<string, unknown>;
    if (status?.succeeded) return <StatusBadge status="Succeeded" />;
    if (status?.failed) return <StatusBadge status="Failed" />;
    if (status?.active) return <StatusBadge status="Running" />;
    return <StatusBadge status="Pending" />;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const cronjobColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'schedule', header: 'Schedule', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.schedule as string || '-' },
  { id: 'suspend', header: 'Suspend', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.suspend ? 'Yes' : 'No' },
  { id: 'active', header: 'Active', cell: ({ row }) => ((row.original.status as Record<string, unknown>)?.active as unknown[] || []).length },
  { id: 'lastSchedule', header: 'Last Schedule', cell: ({ row }) => <AgeDisplay timestamp={(row.original.status as Record<string, unknown>)?.lastScheduleTime as string} /> },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const ingressColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'class', header: 'Class', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.ingressClassName as string || row.original.metadata?.annotations?.['kubernetes.io/ingress.class'] || '-' },
  { id: 'hosts', header: 'Hosts', cell: ({ row }) => {
    const rules = ((row.original.spec as Record<string, unknown>)?.rules || []) as Array<Record<string, unknown>>;
    const hosts = rules.map((r) => r.host as string).filter(Boolean);
    return hosts.length > 0 ? <span className="font-mono text-xs">{hosts.join(', ')}</span> : '*';
  }},
  { id: 'loadBalancer', header: 'Load Balancer', cell: ({ row }) => {
    const status = row.original.status as Record<string, unknown>;
    const lb = status?.loadBalancer as Record<string, unknown> | undefined;
    const ingress = lb?.ingress as Array<Record<string, string>> | undefined;
    if (!ingress?.length) return <span className="text-muted-foreground">-</span>;
    const addr = ingress[0].hostname || ingress[0].ip || '-';
    return <span className="font-mono text-xs truncate max-w-[200px] block">{addr}</span>;
  }},
  { id: 'rules', header: 'Rules', cell: ({ row }) => {
    const rules = ((row.original.spec as Record<string, unknown>)?.rules || []) as Array<Record<string, unknown>>;
    const pathCount = rules.reduce((sum: number, r) => sum + ((r.http as Record<string, unknown[]>)?.paths?.length || 0), 0);
    return `${rules.length} rules, ${pathCount} paths`;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const configmapColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'data', header: 'Data', cell: ({ row }) => Object.keys((row.original.data as Record<string, unknown>) || {}).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const secretColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => (row.original as Record<string, unknown>).type as string || '-' },
  { id: 'data', header: 'Data', cell: ({ row }) => Object.keys((row.original.data as Record<string, unknown>) || {}).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const pvcColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={(row.original.status as Record<string, unknown>)?.phase as string || 'Unknown'} /> },
  { id: 'volume', header: 'Volume', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.volumeName as string || '-' },
  { id: 'capacity', header: 'Capacity', cell: ({ row }) => ((row.original.status as Record<string, unknown>)?.capacity as Record<string, string>)?.storage || '-' },
  { id: 'storageClass', header: 'Storage Class', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.storageClassName as string || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const serviceaccountColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'secrets', header: 'Secrets', cell: ({ row }) => ((row.original as Record<string, unknown>).secrets as unknown[] || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const roleColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'rules', header: 'Rules', cell: ({ row }) => ((row.original as Record<string, unknown>).rules as unknown[] || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const rolebindingColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'role', header: 'Role', cell: ({ row }) => {
    const roleRef = (row.original as Record<string, unknown>).roleRef as Record<string, string> | undefined;
    return `${roleRef?.kind}/${roleRef?.name}`;
  }},
  { id: 'subjects', header: 'Subjects', cell: ({ row }) => ((row.original as Record<string, unknown>).subjects as unknown[] || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const networkpolicyColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'podSelector', header: 'Pod Selector', cell: ({ row }) => {
    const podSelector = (row.original.spec as Record<string, unknown>)?.podSelector as Record<string, unknown> | undefined;
    const labels = (podSelector?.matchLabels || {}) as Record<string, string>;
    const entries = Object.entries(labels);
    return entries.length > 0 ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : '<all>' ;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const eventColumns: ColumnDef<KubeResource>[] = [
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => <StatusBadge status={(row.original as Record<string, unknown>).type as string || 'Normal'} /> },
  { id: 'reason', header: 'Reason', cell: ({ row }) => (row.original as Record<string, unknown>).reason as string || '-' },
  { id: 'object', header: 'Object', cell: ({ row }) => {
    const involvedObject = (row.original as Record<string, unknown>).involvedObject as Record<string, string> | undefined;
    return `${involvedObject?.kind}/${involvedObject?.name}`;
  }},
  { accessorFn: (row) => (row as Record<string, unknown>).message, id: 'message', header: 'Message', cell: ({ row }) => <span className="text-sm truncate max-w-md block">{(row.original as Record<string, unknown>).message as string}</span> },
  { id: 'count', header: 'Count', cell: ({ row }) => (row.original as Record<string, unknown>).count as number || 1 },
  { id: 'lastSeen', header: 'Last Seen', cell: ({ row }) => <AgeDisplay timestamp={(row.original as Record<string, unknown>).lastTimestamp as string || row.original.metadata?.creationTimestamp} /> },
];

export const nodeColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'status', header: 'Status', cell: ({ row }) => {
    const conditions = ((row.original.status as Record<string, unknown>)?.conditions || []) as Array<Record<string, string>>;
    const ready = conditions.find((c) => c.type === 'Ready');
    return <StatusBadge status={ready?.status === 'True' ? 'Ready' : 'NotReady'} />;
  }},
  { id: 'roles', header: 'Roles', cell: ({ row }) => {
    const labels = row.original.metadata?.labels || {};
    const roles = Object.keys(labels).filter(k => k.startsWith('node-role.kubernetes.io/')).map(k => k.split('/')[1]);
    return roles.join(', ') || '-';
  }},
  { id: 'version', header: 'Version', cell: ({ row }) => ((row.original.status as Record<string, unknown>)?.nodeInfo as Record<string, string>)?.kubeletVersion || '-' },
  { id: 'os', header: 'OS', cell: ({ row }) => ((row.original.status as Record<string, unknown>)?.nodeInfo as Record<string, string>)?.osImage || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const pvColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'capacity', header: 'Capacity', cell: ({ row }) => ((row.original.spec as Record<string, unknown>)?.capacity as Record<string, string>)?.storage || '-' },
  { id: 'accessModes', header: 'Access Modes', cell: ({ row }) => ((row.original.spec as Record<string, unknown>)?.accessModes as string[] || []).join(', ') },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={(row.original.status as Record<string, unknown>)?.phase as string || 'Unknown'} /> },
  { id: 'claim', header: 'Claim', cell: ({ row }) => {
    const claimRef = (row.original.spec as Record<string, unknown>)?.claimRef as Record<string, string> | undefined;
    return claimRef ? `${claimRef.namespace}/${claimRef.name}` : '-';
  }},
  { id: 'storageClass', header: 'Storage Class', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.storageClassName as string || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const clusterroleColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'rules', header: 'Rules', cell: ({ row }) => ((row.original as Record<string, unknown>).rules as unknown[] || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const clusterrolebindingColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'role', header: 'Role', cell: ({ row }) => {
    const roleRef = (row.original as Record<string, unknown>).roleRef as Record<string, string> | undefined;
    return `${roleRef?.kind}/${roleRef?.name}`;
  }},
  { id: 'subjects', header: 'Subjects', cell: ({ row }) => ((row.original as Record<string, unknown>).subjects as unknown[] || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const endpointColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'endpoints', header: 'Endpoints', cell: ({ row }) => {
    const subsets = ((row.original as Record<string, unknown>).subsets || []) as Array<Record<string, unknown>>;
    const addrs: string[] = [];
    for (const s of subsets) {
      const ports = ((s.ports || []) as Array<Record<string, unknown>>).map((p) => p.port);
      for (const a of (s.addresses || []) as Array<Record<string, string>>) {
        if (ports.length > 0) {
          for (const port of ports) addrs.push(`${a.ip}:${port}`);
        } else {
          addrs.push(a.ip);
        }
      }
    }
    if (addrs.length === 0) return <span className="text-muted-foreground">None</span>;
    const display = addrs.slice(0, 5).join(', ');
    const more = addrs.length > 5 ? ` +${addrs.length - 5} more` : '';
    return <span className="font-mono text-xs">{display}{more && <span className="text-muted-foreground">{more}</span>}</span>;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

function getHelmStatusLabel(status: string): string {
  if (!status) return 'Unknown';
  // Capitalize first letter
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
}

export const helmReleaseColumns: ColumnDef<HelmRelease>[] = [
  {
    accessorFn: (row) => row.name,
    id: 'name',
    header: 'Name',
  },
  {
    id: 'namespace',
    header: 'Namespace',
    cell: ({ row }) => (
      <Badge variant="outline" className="font-normal text-xs">
        {row.original.namespace}
      </Badge>
    ),
  },
  {
    id: 'chart',
    header: 'Chart',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.chart}</span>,
  },
  {
    id: 'appVersion',
    header: 'App Version',
    cell: ({ row }) => row.original.app_version || '-',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={getHelmStatusLabel(row.original.status)} />,
  },
  {
    id: 'revision',
    header: 'Revision',
    cell: ({ row }) => row.original.revision,
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: ({ row }) => {
      const d = row.original.updated;
      return d ? new Date(d).toLocaleString() : '-';
    },
  },
];

export const hpaColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'reference', header: 'Reference', cell: ({ row }) => {
    const ref = (row.original.spec as Record<string, unknown>)?.scaleTargetRef as Record<string, string> | undefined;
    return ref ? `${ref.kind}/${ref.name}` : '-';
  }},
  { id: 'minReplicas', header: 'Min', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.minReplicas as number ?? 1 },
  { id: 'maxReplicas', header: 'Max', cell: ({ row }) => (row.original.spec as Record<string, unknown>)?.maxReplicas as number ?? '-' },
  { id: 'replicas', header: 'Replicas', cell: ({ row }) => `${(row.original.status as Record<string, unknown>)?.currentReplicas || 0}/${(row.original.status as Record<string, unknown>)?.desiredReplicas || 0}` },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const resourcequotaColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'resources', header: 'Resources', cell: ({ row }) => {
    const status = row.original.status as Record<string, unknown>;
    const spec = row.original.spec as Record<string, unknown>;
    const hard = (status?.hard || spec?.hard || {}) as Record<string, unknown>;
    return Object.keys(hard).length;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const limitrangeColumns: ColumnDef<KubeResource>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'limits', header: 'Limits', cell: ({ row }) => {
    const limits = ((row.original.spec as Record<string, unknown>)?.limits || []) as Array<Record<string, string>>;
    return limits.map((l) => l.type).join(', ') || '-';
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const COLUMN_MAP: Record<string, ColumnDef<KubeResource>[]> = {
  pods: podColumns,
  deployments: deploymentColumns,
  statefulsets: statefulsetColumns,
  daemonsets: daemonsetColumns,
  replicasets: replicasetColumns,
  jobs: jobColumns,
  cronjobs: cronjobColumns,
  services: serviceColumns,
  ingresses: ingressColumns,
  configmaps: configmapColumns,
  secrets: secretColumns,
  pvcs: pvcColumns,
  serviceaccounts: serviceaccountColumns,
  roles: roleColumns,
  rolebindings: rolebindingColumns,
  networkpolicies: networkpolicyColumns,
  events: eventColumns,
  nodes: nodeColumns,
  pvs: pvColumns,
  clusterroles: clusterroleColumns,
  clusterrolebindings: clusterrolebindingColumns,
  endpoints: endpointColumns,
  horizontalpodautoscalers: hpaColumns,
  resourcequotas: resourcequotaColumns,
  limitranges: limitrangeColumns,
};
