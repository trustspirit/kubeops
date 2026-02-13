import useSWR from 'swr';

interface KubeconfigContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
}

export function useKubeconfigContexts() {
  const { data, error, isLoading, mutate } = useSWR<{ contexts: KubeconfigContext[] }>(
    '/api/kubeconfig/contexts',
    {
      refreshInterval: 30000,
    }
  );

  return {
    contexts: data?.contexts || [],
    error,
    isLoading,
    mutate,
  };
}
