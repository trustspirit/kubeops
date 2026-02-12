'use client';

import { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { AgeDisplay } from '@/components/shared/age-display';
import { Badge } from '@/components/ui/badge';

const nsCol: ColumnDef<any> = {
  accessorFn: (row) => row.metadata?.namespace,
  id: 'namespace',
  header: 'Namespace',
  cell: ({ row }) => (
    <Badge variant="outline" className="font-normal text-xs">
      {row.original.metadata?.namespace}
    </Badge>
  ),
};

function getPodStatus(pod: any): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  return pod.status?.phase || 'Unknown';
}

function getPodRestarts(pod: any): number {
  return (pod.status?.containerStatuses || []).reduce(
    (sum: number, cs: any) => sum + (cs.restartCount || 0),
    0
  );
}

function getReadyContainers(pod: any): string {
  const statuses = pod.status?.containerStatuses || [];
  const ready = statuses.filter((cs: any) => cs.ready).length;
  return `${ready}/${statuses.length || pod.spec?.containers?.length || 0}`;
}

function getDeploymentReady(dep: any): string {
  const ready = dep.status?.readyReplicas || 0;
  const desired = dep.spec?.replicas || 0;
  return `${ready}/${desired}`;
}

export const podColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={getPodStatus(row.original)} /> },
  { id: 'ready', header: 'Ready', cell: ({ row }) => getReadyContainers(row.original) },
  { id: 'restarts', header: 'Restarts', cell: ({ row }) => getPodRestarts(row.original) },
  { id: 'node', header: 'Node', cell: ({ row }) => row.original.spec?.nodeName || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const deploymentColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'ready', header: 'Ready', cell: ({ row }) => getDeploymentReady(row.original) },
  { id: 'upToDate', header: 'Up-to-date', cell: ({ row }) => row.original.status?.updatedReplicas || 0 },
  { id: 'available', header: 'Available', cell: ({ row }) => row.original.status?.availableReplicas || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const serviceColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => {
    const type = row.original.spec?.type || 'ClusterIP';
    return <Badge variant={type === 'LoadBalancer' ? 'default' : type === 'NodePort' ? 'secondary' : 'outline'} className="text-xs font-mono">{type}</Badge>;
  }},
  { id: 'clusterIP', header: 'Cluster IP', cell: ({ row }) => <span className="font-mono text-xs">{row.original.spec?.clusterIP || '-'}</span> },
  { id: 'externalIP', header: 'External IP', cell: ({ row }) => {
    const svc = row.original;
    const lbIngress = svc.status?.loadBalancer?.ingress;
    if (lbIngress?.length) return <span className="font-mono text-xs">{lbIngress[0].hostname || lbIngress[0].ip || '-'}</span>;
    const externalIPs = svc.spec?.externalIPs;
    if (externalIPs?.length) return <span className="font-mono text-xs">{externalIPs.join(', ')}</span>;
    return <span className="text-muted-foreground">-</span>;
  }},
  { id: 'ports', header: 'Ports', cell: ({ row }) => {
    const ports = row.original.spec?.ports || [];
    return <span className="font-mono text-xs">{ports.map((p: any) => {
      let s = `${p.port}`;
      if (p.nodePort) s += `:${p.nodePort}`;
      s += `/${p.protocol || 'TCP'}`;
      return s;
    }).join(', ') || '-'}</span>;
  }},
  { id: 'selector', header: 'Selector', cell: ({ row }) => {
    const sel = row.original.spec?.selector || {};
    const entries = Object.entries(sel);
    if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
    return <span className="text-xs font-mono truncate max-w-[200px] block">{entries.map(([k, v]) => `${k}=${v}`).join(', ')}</span>;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const statefulsetColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'ready', header: 'Ready', cell: ({ row }) => `${row.original.status?.readyReplicas || 0}/${row.original.spec?.replicas || 0}` },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const daemonsetColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'desired', header: 'Desired', cell: ({ row }) => row.original.status?.desiredNumberScheduled || 0 },
  { id: 'current', header: 'Current', cell: ({ row }) => row.original.status?.currentNumberScheduled || 0 },
  { id: 'ready', header: 'Ready', cell: ({ row }) => row.original.status?.numberReady || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const replicasetColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'desired', header: 'Desired', cell: ({ row }) => row.original.spec?.replicas || 0 },
  { id: 'current', header: 'Current', cell: ({ row }) => row.original.status?.replicas || 0 },
  { id: 'ready', header: 'Ready', cell: ({ row }) => row.original.status?.readyReplicas || 0 },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const jobColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'completions', header: 'Completions', cell: ({ row }) => `${row.original.status?.succeeded || 0}/${row.original.spec?.completions || 1}` },
  { id: 'status', header: 'Status', cell: ({ row }) => {
    if (row.original.status?.succeeded) return <StatusBadge status="Succeeded" />;
    if (row.original.status?.failed) return <StatusBadge status="Failed" />;
    if (row.original.status?.active) return <StatusBadge status="Running" />;
    return <StatusBadge status="Pending" />;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const cronjobColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'schedule', header: 'Schedule', cell: ({ row }) => row.original.spec?.schedule || '-' },
  { id: 'suspend', header: 'Suspend', cell: ({ row }) => row.original.spec?.suspend ? 'Yes' : 'No' },
  { id: 'active', header: 'Active', cell: ({ row }) => (row.original.status?.active || []).length },
  { id: 'lastSchedule', header: 'Last Schedule', cell: ({ row }) => <AgeDisplay timestamp={row.original.status?.lastScheduleTime} /> },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const ingressColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'class', header: 'Class', cell: ({ row }) => row.original.spec?.ingressClassName || row.original.metadata?.annotations?.['kubernetes.io/ingress.class'] || '-' },
  { id: 'hosts', header: 'Hosts', cell: ({ row }) => {
    const hosts = (row.original.spec?.rules || []).map((r: any) => r.host).filter(Boolean);
    return hosts.length > 0 ? <span className="font-mono text-xs">{hosts.join(', ')}</span> : '*';
  }},
  { id: 'loadBalancer', header: 'Load Balancer', cell: ({ row }) => {
    const ingress = row.original.status?.loadBalancer?.ingress;
    if (!ingress?.length) return <span className="text-muted-foreground">-</span>;
    const addr = ingress[0].hostname || ingress[0].ip || '-';
    return <span className="font-mono text-xs truncate max-w-[200px] block">{addr}</span>;
  }},
  { id: 'rules', header: 'Rules', cell: ({ row }) => {
    const rules = row.original.spec?.rules || [];
    const pathCount = rules.reduce((sum: number, r: any) => sum + (r.http?.paths?.length || 0), 0);
    return `${rules.length} rules, ${pathCount} paths`;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const configmapColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'data', header: 'Data', cell: ({ row }) => Object.keys(row.original.data || {}).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const secretColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => row.original.type || '-' },
  { id: 'data', header: 'Data', cell: ({ row }) => Object.keys(row.original.data || {}).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const pvcColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status?.phase || 'Unknown'} /> },
  { id: 'volume', header: 'Volume', cell: ({ row }) => row.original.spec?.volumeName || '-' },
  { id: 'capacity', header: 'Capacity', cell: ({ row }) => row.original.status?.capacity?.storage || '-' },
  { id: 'storageClass', header: 'Storage Class', cell: ({ row }) => row.original.spec?.storageClassName || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const serviceaccountColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'secrets', header: 'Secrets', cell: ({ row }) => (row.original.secrets || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const roleColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'rules', header: 'Rules', cell: ({ row }) => (row.original.rules || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const rolebindingColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'role', header: 'Role', cell: ({ row }) => `${row.original.roleRef?.kind}/${row.original.roleRef?.name}` },
  { id: 'subjects', header: 'Subjects', cell: ({ row }) => (row.original.subjects || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const networkpolicyColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'podSelector', header: 'Pod Selector', cell: ({ row }) => {
    const labels = row.original.spec?.podSelector?.matchLabels || {};
    const entries = Object.entries(labels);
    return entries.length > 0 ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : '<all>' ;
  }},
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const eventColumns: ColumnDef<any>[] = [
  nsCol,
  { id: 'type', header: 'Type', cell: ({ row }) => <StatusBadge status={row.original.type || 'Normal'} /> },
  { id: 'reason', header: 'Reason', cell: ({ row }) => row.original.reason || '-' },
  { id: 'object', header: 'Object', cell: ({ row }) => `${row.original.involvedObject?.kind}/${row.original.involvedObject?.name}` },
  { accessorFn: (row) => row.message, id: 'message', header: 'Message', cell: ({ row }) => <span className="text-sm truncate max-w-md block">{row.original.message}</span> },
  { id: 'count', header: 'Count', cell: ({ row }) => row.original.count || 1 },
  { id: 'lastSeen', header: 'Last Seen', cell: ({ row }) => <AgeDisplay timestamp={row.original.lastTimestamp || row.original.metadata?.creationTimestamp} /> },
];

export const nodeColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'status', header: 'Status', cell: ({ row }) => {
    const ready = (row.original.status?.conditions || []).find((c: any) => c.type === 'Ready');
    return <StatusBadge status={ready?.status === 'True' ? 'Ready' : 'NotReady'} />;
  }},
  { id: 'roles', header: 'Roles', cell: ({ row }) => {
    const labels = row.original.metadata?.labels || {};
    const roles = Object.keys(labels).filter(k => k.startsWith('node-role.kubernetes.io/')).map(k => k.split('/')[1]);
    return roles.join(', ') || '-';
  }},
  { id: 'version', header: 'Version', cell: ({ row }) => row.original.status?.nodeInfo?.kubeletVersion || '-' },
  { id: 'os', header: 'OS', cell: ({ row }) => row.original.status?.nodeInfo?.osImage || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const pvColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'capacity', header: 'Capacity', cell: ({ row }) => row.original.spec?.capacity?.storage || '-' },
  { id: 'accessModes', header: 'Access Modes', cell: ({ row }) => (row.original.spec?.accessModes || []).join(', ') },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status?.phase || 'Unknown'} /> },
  { id: 'claim', header: 'Claim', cell: ({ row }) => row.original.spec?.claimRef ? `${row.original.spec.claimRef.namespace}/${row.original.spec.claimRef.name}` : '-' },
  { id: 'storageClass', header: 'Storage Class', cell: ({ row }) => row.original.spec?.storageClassName || '-' },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const clusterroleColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'rules', header: 'Rules', cell: ({ row }) => (row.original.rules || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const clusterrolebindingColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  { id: 'role', header: 'Role', cell: ({ row }) => `${row.original.roleRef?.kind}/${row.original.roleRef?.name}` },
  { id: 'subjects', header: 'Subjects', cell: ({ row }) => (row.original.subjects || []).length },
  { id: 'age', header: 'Age', cell: ({ row }) => <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} /> },
];

export const endpointColumns: ColumnDef<any>[] = [
  { accessorFn: (row) => row.metadata?.name, id: 'name', header: 'Name' },
  nsCol,
  { id: 'endpoints', header: 'Endpoints', cell: ({ row }) => {
    const subsets = row.original.subsets || [];
    const addrs: string[] = [];
    for (const s of subsets) {
      const ports = (s.ports || []).map((p: any) => p.port);
      for (const a of s.addresses || []) {
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

export const helmReleaseColumns: ColumnDef<any>[] = [
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

export const COLUMN_MAP: Record<string, ColumnDef<any>[]> = {
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
  helm: helmReleaseColumns,
};
