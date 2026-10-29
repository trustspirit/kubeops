export interface PortForwardInfo {
  id: string;
  clusterId: string;
  namespace: string;
  resourceType: 'pod' | 'service';
  resourceName: string;
  containerPort: number;
  localPort: number;
  status: string;
  /** Last kubectl error once the forward has died (status 'error'). */
  error?: string;
}

export interface PortForwardTarget {
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  containerPort: number;
}

function canonicalResourceType(value: string): 'pod' | 'service' | null {
  if (value === 'pod' || value === 'pods') return 'pod';
  if (value === 'svc' || value === 'service' || value === 'services') return 'service';
  return null;
}

export function findMatchingPortForward(
  forwards: PortForwardInfo[],
  target: PortForwardTarget,
): PortForwardInfo | undefined {
  const resourceType = canonicalResourceType(target.resourceType);
  if (!resourceType) return undefined;

  // A died forward stays listed with status 'error' for a while; it is not a
  // live tunnel to link to, and starting the same target again replaces it.
  return forwards.find(forward => (
    forward.status !== 'error'
    && forward.clusterId === target.clusterId
    && forward.namespace === target.namespace
    && forward.resourceType === resourceType
    && forward.resourceName === target.resourceName
    && forward.containerPort === target.containerPort
  ));
}
