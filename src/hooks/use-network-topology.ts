import useSWR from 'swr';

export interface PodGroupData {
  id: string;
  labels: Record<string, string>;
  pods: string[];
  policies: string[];
}

export interface EdgeData {
  from: string;
  to: string;
  direction: 'ingress' | 'egress';
  ports: { port?: number | string; protocol?: string }[];
  policy: string;
  [key: string]: unknown;
}

export interface NetworkTopologyData {
  podGroups: PodGroupData[];
  edges: EdgeData[];
  isolatedPods: string[];
  defaultDeny: { ingress: boolean; egress: boolean };
}

interface UseNetworkTopologyOptions {
  clusterId: string;
  namespace: string;
  enabled?: boolean;
}

export function useNetworkTopology({
  clusterId,
  namespace,
  enabled = true,
}: UseNetworkTopologyOptions) {
  const key =
    enabled && clusterId && namespace
      ? `/api/clusters/${encodeURIComponent(clusterId)}/network-topology?namespace=${encodeURIComponent(namespace)}`
      : null;

  const { data, error, isLoading, mutate } = useSWR<NetworkTopologyData>(key, {
    refreshInterval: 30000,
  });

  return {
    data,
    error,
    isLoading,
    mutate,
  };
}
