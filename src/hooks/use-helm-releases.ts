import useSWR from 'swr';
import { fetcher } from '@/lib/api-client';
import type { HelmRelease } from '@/types/helm';

interface HelmReleasesResponse {
  releases: HelmRelease[];
}

export function useHelmReleases({ clusterId, namespace }: { clusterId: string | null; namespace?: string }) {
  const params = namespace && namespace !== '_all' ? `?namespace=${encodeURIComponent(namespace)}` : '';
  const url = clusterId ? `/api/clusters/${encodeURIComponent(clusterId)}/helm/releases${params}` : null;
  return useSWR<HelmReleasesResponse>(url, fetcher, { refreshInterval: 10000 });
}
