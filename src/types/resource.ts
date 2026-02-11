export interface KubeMetadata {
  name: string;
  namespace?: string;
  uid?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  resourceVersion?: string;
}

export interface KubeResource {
  apiVersion?: string;
  kind?: string;
  metadata: KubeMetadata;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

export interface KubeList<T = KubeResource> {
  apiVersion: string;
  kind: string;
  metadata: {
    continue?: string;
    resourceVersion?: string;
  };
  items: T[];
}
