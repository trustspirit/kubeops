import useSWR from 'swr';
import { fetcher } from '@/lib/api-client';

interface RBACEntry {
  subject: { kind: string; name: string; namespace?: string };
  role: { kind: string; name: string };
  namespace: string;
  rules: Array<{ apiGroups: string[]; resources: string[]; verbs: string[] }>;
  bindingName: string;
  bindingKind: string;
}

interface RBACSummaryResponse {
  entries: RBACEntry[];
}

export function useRBACSummary({ clusterId, enabled = true }: { clusterId: string | null; enabled?: boolean }) {
  const url = clusterId ? `/api/clusters/${encodeURIComponent(clusterId)}/rbac/summary` : null;
  return useSWR<RBACSummaryResponse>(enabled ? url : null, fetcher, { refreshInterval: 30000 });
}
