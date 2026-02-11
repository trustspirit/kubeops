export interface ClusterInfo {
  name: string;
  context: string;
  cluster: string;
  user: string;
  namespace?: string;
  server?: string;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  server?: string;
  isCurrent: boolean;
}
