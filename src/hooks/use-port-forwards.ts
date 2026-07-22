import useSWR from 'swr';
import type { PortForwardInfo } from '@/lib/port-forward-client';

/**
 * Shared hook for port-forward data.
 * No polling — relies on globalMutate('/api/port-forward') calls after start/stop actions.
 */
export function usePortForwards() {
  const { data, mutate } = useSWR<{ forwards: PortForwardInfo[] }>('/api/port-forward');
  const forwards: PortForwardInfo[] = data?.forwards || [];
  return { forwards, mutate };
}
