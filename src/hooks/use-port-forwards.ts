import useSWR from 'swr';

interface PortForward {
  id: string;
  localPort: number;
  containerPort: number;
  status: string;
}

/**
 * Shared hook for port-forward data.
 * No polling — relies on globalMutate('/api/port-forward') calls after start/stop actions.
 */
export function usePortForwards() {
  const { data, mutate } = useSWR<{ forwards: PortForward[] }>('/api/port-forward');
  const forwards: PortForward[] = data?.forwards || [];
  return { forwards, mutate };
}
