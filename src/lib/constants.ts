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
  Clock,
  Network,
  Globe,
  ShieldAlert,
  FileText,
  Lock,
  User,
  Link,
  FolderClosed,
  CalendarClock,
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
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'Services', resourceType: 'services', icon: Network },
      { label: 'Ingresses', resourceType: 'ingresses', icon: Globe },
      { label: 'Network Policies', resourceType: 'networkpolicies', icon: ShieldAlert },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'ConfigMaps', resourceType: 'configmaps', icon: FileText },
      { label: 'Secrets', resourceType: 'secrets', icon: Lock },
      { label: 'Service Accounts', resourceType: 'serviceaccounts', icon: User },
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
};
