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

export interface ResourceConfig {
  apiClass: string;
  listFn: string;
  listAllFn?: string;
  getFn: string;
  replaceFn?: string;
  deleteFn?: string;
  kind: string;
  namespaced: boolean;
}

export interface ResourceListResponse {
  items: any[];
  metadata?: {
    continue?: string;
    resourceVersion?: string;
  };
}
