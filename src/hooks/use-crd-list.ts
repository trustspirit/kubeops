import useSWR from 'swr';

interface UseCrdListOptions {
  clusterId: string | null;
  refreshInterval?: number;
  enabled?: boolean;
}

export interface CrdItem {
  name: string;
  group: string;
  kind: string;
  plural: string;
  singular: string;
  scope: 'Namespaced' | 'Cluster';
  version: string;
  versions: string[];
  printerColumns: PrinterColumn[];
}

export interface PrinterColumn {
  name: string;
  type: string;
  jsonPath: string;
  description?: string;
  priority?: number;
}

export function useCrdList({
  clusterId,
  refreshInterval = 30000,
  enabled = true,
}: UseCrdListOptions) {
  const key =
    enabled && clusterId
      ? `/api/clusters/${encodeURIComponent(clusterId)}/crds`
      : null;

  return useSWR<{ items: CrdItem[] }>(key, {
    refreshInterval,
  });
}
