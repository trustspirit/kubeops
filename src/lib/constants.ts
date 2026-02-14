import {
  LayoutDashboard,
  Server,
  HardDrive,
  Shield,
  ShieldCheck,
  Box,
  Layers,
  Database,
  Cpu,
  Copy,
  Play,
  Network,
  Globe,
  ShieldAlert,
  FileText,
  Lock,
  User,
  Link,
  FolderClosed,
  CalendarClock,
  Plug,
  Workflow,
  Puzzle,
  ShieldQuestion,
  Ship,
  ArrowUpDown,
  Gauge,
  SlidersHorizontal,
  Share2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  resourceType: string;
  icon: LucideIcon;
  clusterScoped?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const SIDEBAR_SECTIONS: NavSection[] = [
  {
    title: 'Cluster',
    items: [
      { label: 'Overview', resourceType: '', icon: LayoutDashboard, clusterScoped: true },
      { label: 'App Map', resourceType: 'app-map', icon: Workflow, clusterScoped: true },
      { label: 'Nodes', resourceType: 'nodes', icon: Server, clusterScoped: true },
      { label: 'Persistent Volumes', resourceType: 'pvs', icon: HardDrive, clusterScoped: true },
      { label: 'Cluster Roles', resourceType: 'clusterroles', icon: Shield, clusterScoped: true },
      { label: 'Cluster Role Bindings', resourceType: 'clusterrolebindings', icon: ShieldCheck, clusterScoped: true },
    ],
  },
  {
    title: 'Workloads',
    items: [
      { label: 'Pods', resourceType: 'pods', icon: Box },
      { label: 'Deployments', resourceType: 'deployments', icon: Layers },
      { label: 'StatefulSets', resourceType: 'statefulsets', icon: Database },
      { label: 'DaemonSets', resourceType: 'daemonsets', icon: Cpu },
      { label: 'ReplicaSets', resourceType: 'replicasets', icon: Copy },
      { label: 'Jobs', resourceType: 'jobs', icon: Play },
      { label: 'CronJobs', resourceType: 'cronjobs', icon: CalendarClock },
      { label: 'HPA', resourceType: 'horizontalpodautoscalers', icon: ArrowUpDown },
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'Services', resourceType: 'services', icon: Network },
      { label: 'Ingresses', resourceType: 'ingresses', icon: Globe },
      { label: 'Endpoints', resourceType: 'endpoints', icon: Link },
      { label: 'Network Policies', resourceType: 'networkpolicies', icon: ShieldAlert },
      { label: 'Network Topology', resourceType: 'network-topology', icon: Share2 },
      { label: 'Port Forwarding', resourceType: 'port-forwarding', icon: Plug, clusterScoped: true },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'ConfigMaps', resourceType: 'configmaps', icon: FileText },
      { label: 'Secrets', resourceType: 'secrets', icon: Lock },
      { label: 'Service Accounts', resourceType: 'serviceaccounts', icon: User },
      { label: 'Resource Quotas', resourceType: 'resourcequotas', icon: Gauge },
      { label: 'Limit Ranges', resourceType: 'limitranges', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Storage',
    items: [
      { label: 'Persistent Volume Claims', resourceType: 'pvcs', icon: FolderClosed },
    ],
  },
  {
    title: 'Access Control',
    items: [
      { label: 'RBAC Summary', resourceType: 'rbac', icon: ShieldQuestion, clusterScoped: true },
      { label: 'Roles', resourceType: 'roles', icon: Shield },
      { label: 'Role Bindings', resourceType: 'rolebindings', icon: Link },
    ],
  },
  {
    title: 'Events',
    items: [
      { label: 'Events', resourceType: 'events', icon: CalendarClock },
    ],
  },
  {
    title: 'Custom Resources',
    items: [
      { label: 'Custom Resources', resourceType: 'custom-resources', icon: Puzzle, clusterScoped: true },
    ],
  },
  {
    title: 'Helm',
    items: [
      { label: 'Releases', resourceType: 'helm', icon: Ship, clusterScoped: true },
    ],
  },
];

export const RESOURCE_LABELS: Record<string, string> = {
  pods: 'Pods',
  deployments: 'Deployments',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  replicasets: 'ReplicaSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  services: 'Services',
  ingresses: 'Ingresses',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  pvcs: 'Persistent Volume Claims',
  serviceaccounts: 'Service Accounts',
  roles: 'Roles',
  rolebindings: 'Role Bindings',
  networkpolicies: 'Network Policies',
  events: 'Events',
  nodes: 'Nodes',
  pvs: 'Persistent Volumes',
  clusterroles: 'Cluster Roles',
  clusterrolebindings: 'Cluster Role Bindings',
  endpoints: 'Endpoints',
  'custom-resources': 'Custom Resources',
  'rbac': 'RBAC Summary',
  'helm': 'Helm Releases',
  horizontalpodautoscalers: 'Horizontal Pod Autoscalers',
  resourcequotas: 'Resource Quotas',
  limitranges: 'Limit Ranges',
  'network-topology': 'Network Topology',
};
