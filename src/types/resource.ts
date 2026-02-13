export interface KubeMetadata {
  name: string;
  namespace?: string;
  uid?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  resourceVersion?: string;
  ownerReferences?: { kind: string; name: string; uid: string }[];
  deletionTimestamp?: string;
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

// --- Pod types ---

export interface ContainerStateWaiting {
  reason?: string;
  message?: string;
}

export interface ContainerState {
  waiting?: ContainerStateWaiting;
  running?: { startedAt?: string };
  terminated?: { exitCode?: number; reason?: string };
}

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state?: ContainerState;
}

export interface ContainerSpec {
  name: string;
  image?: string;
  ports?: { containerPort: number; protocol?: string; name?: string }[];
  env?: { name: string; value?: string; valueFrom?: Record<string, unknown> }[];
  resources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
  command?: string[];
  args?: string[];
  volumeMounts?: { name: string; mountPath: string; readOnly?: boolean }[];
}

export interface KubePod extends KubeResource {
  spec: {
    nodeName?: string;
    containers: ContainerSpec[];
    restartPolicy?: string;
    serviceAccountName?: string;
    volumes?: Record<string, unknown>[];
    [key: string]: unknown;
  };
  status: {
    phase?: string;
    podIP?: string;
    hostIP?: string;
    qosClass?: string;
    containerStatuses?: ContainerStatus[];
    conditions?: { type: string; status: string; reason?: string }[];
    [key: string]: unknown;
  };
}

// --- Workload types ---

export interface KubeDeployment extends KubeResource {
  spec: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
    strategy?: { type?: string };
    template?: { metadata?: KubeMetadata; spec?: { containers?: ContainerSpec[] } };
    [key: string]: unknown;
  };
  status: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    conditions?: { type: string; status: string; reason?: string }[];
    [key: string]: unknown;
  };
}

export interface KubeStatefulSet extends KubeResource {
  spec: {
    replicas?: number;
    serviceName?: string;
    selector?: { matchLabels?: Record<string, string> };
    updateStrategy?: { type?: string };
    template?: { metadata?: KubeMetadata; spec?: { containers?: ContainerSpec[] } };
    [key: string]: unknown;
  };
  status: {
    replicas?: number;
    readyReplicas?: number;
    currentReplicas?: number;
    [key: string]: unknown;
  };
}

export interface KubeDaemonSet extends KubeResource {
  spec: Record<string, unknown>;
  status: {
    desiredNumberScheduled?: number;
    numberReady?: number;
    currentNumberScheduled?: number;
    [key: string]: unknown;
  };
}

// --- Event type ---

export interface KubeEvent extends KubeResource {
  type?: string;
  reason?: string;
  message?: string;
  involvedObject?: { kind?: string; name?: string; namespace?: string };
  lastTimestamp?: string;
  count?: number;
}

// --- Namespace info ---

export interface NamespaceInfo {
  name: string;
  metadata?: KubeMetadata;
}
