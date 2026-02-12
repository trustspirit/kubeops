import useSWR from 'swr';
import { fetcher } from '@/lib/api-client';
import { RBACSummaryResponse } from '@/types/rbac';

export function useRBACSummary({ clusterId, enabled = true }: { clusterId: string | null; enabled?: boolean }) {
  const url = clusterId ? `/api/clusters/${encodeURIComponent(clusterId)}/rbac/summary` : null;
  return useSWR<RBACSummaryResponse>(enabled ? url : null, fetcher, { refreshInterval: 30000 });
}
