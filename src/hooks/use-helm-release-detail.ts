import useSWR from 'swr';
import { fetcher } from '@/lib/api-client';

export function useHelmReleaseDetail({ clusterId, name, namespace }: { clusterId: string | null; name: string; namespace: string }) {
  const url = clusterId
    ? `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases/${encodeURIComponent(name)}?namespace=${encodeURIComponent(namespace)}`
    : null;
  return useSWR(url, fetcher, { refreshInterval: 10000 });
}
