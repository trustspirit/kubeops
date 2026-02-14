import { useMemo } from 'react';
import { useResourceList } from './use-resource-list';
import type { ResourceNodeData } from '@/components/shared/resource-node';
import type { KubeResource, KubeOwnerReference } from '@/types/resource';

export interface TreeNode {
  id: string;
  data: ResourceNodeData;
}

export interface TreeEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

interface UseResourceTreeOptions {
  clusterId: string;
  namespace: string;
  rootKind?: 'Deployment' | 'StatefulSet';
  rootName?: string;
  appFilter?: string;
}

function getAppLabel(resource: KubeResource): string | undefined {
  const labels = resource.metadata?.labels;
  if (!labels) return undefined;
  return labels['app.kubernetes.io/name'] || labels['app'] || labels['app.kubernetes.io/instance'];
}

// Helper type aliases for readability
type Spec = Record<string, unknown>;
type Status = Record<string, unknown>;

function podHealth(pod: KubeResource): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  if (pod.metadata?.deletionTimestamp) return 'Progressing';
  const status = (pod.status || {}) as Status;
  const phase = status.phase as string | undefined;
  if (phase === 'Succeeded') return 'Healthy';
  if (phase === 'Failed') return 'Degraded';
  if (phase === 'Pending') return 'Progressing';
  const statuses = (status.containerStatuses || []) as Array<Record<string, unknown>>;
  if (statuses.length === 0) return 'Progressing';
  const allReady = statuses.every((c) => c.ready);
  if (allReady) return 'Healthy';
  const anyWaiting = statuses.some((c) => {
    const state = c.state as Record<string, Record<string, string>> | undefined;
    return state?.waiting?.reason === 'CrashLoopBackOff' || state?.waiting?.reason === 'ImagePullBackOff' || state?.waiting?.reason === 'ErrImagePull';
  });
  if (anyWaiting) return 'Degraded';
  return 'Progressing';
}

function workloadHealth(resource: KubeResource): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  const spec = (resource.spec || {}) as Spec;
  const status = (resource.status || {}) as Status;
  const desired = (spec.replicas as number) ?? 1;
  const ready = (status.readyReplicas as number) || 0;
  if (ready >= desired && desired > 0) return 'Healthy';
  if (ready > 0) return 'Progressing';
  if (desired === 0) return 'Healthy';
  return 'Degraded';
}

function rsHealth(rs: KubeResource): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  const spec = (rs.spec || {}) as Spec;
  const status = (rs.status || {}) as Status;
  const desired = (spec.replicas as number) ?? 0;
  const ready = (status.readyReplicas as number) || 0;
  if (desired === 0) return 'Healthy';
  if (ready >= desired) return 'Healthy';
  if (ready > 0) return 'Progressing';
  return 'Degraded';
}

function serviceHealth(): 'Healthy' {
  return 'Healthy';
}

function ingressHealth(ingress: KubeResource): 'Healthy' | 'Progressing' {
  const status = (ingress.status || {}) as Status;
  const lb = status.loadBalancer as Record<string, unknown[]> | undefined;
  const lbIngress = lb?.ingress;
  if (lbIngress && lbIngress.length > 0) return 'Healthy';
  return 'Progressing';
}

function podStatus(pod: KubeResource): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  const status = (pod.status || {}) as Status;
  const phase = status.phase as string | undefined;
  const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>;

  // Check waiting containers first
  for (const cs of containerStatuses) {
    const state = cs.state as Record<string, Record<string, string>> | undefined;
    const waitingReason = state?.waiting?.reason;
    if (waitingReason) return waitingReason; // CrashLoopBackOff, ImagePullBackOff, ErrImagePull, ContainerCreating, etc.
  }

  // Check terminated containers
  for (const cs of containerStatuses) {
    const state2 = cs.state as Record<string, Record<string, string>> | undefined;
    const terminatedReason = state2?.terminated?.reason;
    if (terminatedReason) return terminatedReason; // OOMKilled, Error, Completed, etc.
  }

  if (phase === 'Pending' && containerStatuses.length === 0) return 'Pending';
  if (phase === 'Succeeded') return 'Completed';
  if (phase === 'Failed') return 'Failed';
  if (phase === 'Running') {
    const allReady = containerStatuses.every((c) => c.ready);
    if (allReady) return 'Running';
  }
  return 'Progressing';
}

function workloadStatus(resource: KubeResource): string {
  const spec = (resource.spec || {}) as Spec;
  const status = (resource.status || {}) as Status;
  const desired = (spec.replicas as number) ?? 1;
  const ready = (status.readyReplicas as number) || 0;
  if (desired === 0) return 'Scaled to 0';
  if (ready >= desired) return 'Healthy';
  const updated = (status.updatedReplicas as number) || 0;
  if (updated < desired) return 'Updating';
  if (ready > 0) return 'ScalingUp';
  return 'Degraded';
}

function rsStatus(rs: KubeResource): string {
  const spec = (rs.spec || {}) as Spec;
  const status = (rs.status || {}) as Status;
  const desired = (spec.replicas as number) ?? 0;
  const ready = (status.readyReplicas as number) || 0;
  if (desired === 0) return 'Scaled to 0';
  if (ready >= desired) return 'Active';
  return 'ScalingUp';
}

function serviceStatus(): string {
  return 'Active';
}

function ingressStatus(ingress: KubeResource): string {
  const status = (ingress.status || {}) as Status;
  const lb = status.loadBalancer as Record<string, unknown[]> | undefined;
  const lbIngress = lb?.ingress;
  if (lbIngress && lbIngress.length > 0) return 'Active';
  return 'Pending';
}

function podInfo(pod: KubeResource): string {
  const status = (pod.status || {}) as Status;
  const spec = (pod.spec || {}) as Spec;
  const statuses = (status.containerStatuses || []) as Array<Record<string, unknown>>;
  const readyCt = statuses.filter((c) => c.ready).length;
  const containers = spec.containers as unknown[] | undefined;
  const totalCt = statuses.length || containers?.length || 0;
  const restarts = statuses.reduce((s: number, c) => s + ((c.restartCount as number) || 0), 0);
  return `${readyCt}/${totalCt} ready${restarts > 0 ? ` · ${restarts} restarts` : ''}`;
}

function labelsMatch(selector: Record<string, string> | undefined, labels: Record<string, string> | undefined): boolean {
  if (!selector || !labels) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

export function useResourceTree({ clusterId, namespace, rootKind, rootName, appFilter }: UseResourceTreeOptions) {
  const enabled = !!clusterId && !!namespace;

  const { data: podsData, isLoading: podsLoading } = useResourceList({
    clusterId, namespace, resourceType: 'pods', enabled,
  });
  const { data: deploymentsData, isLoading: depsLoading } = useResourceList({
    clusterId, namespace, resourceType: 'deployments', enabled,
  });
  const { data: rsData, isLoading: rsLoading } = useResourceList({
    clusterId, namespace, resourceType: 'replicasets', enabled,
  });
  const { data: stsData, isLoading: stsLoading } = useResourceList({
    clusterId, namespace, resourceType: 'statefulsets', enabled,
  });
  const { data: dsData, isLoading: dsLoading } = useResourceList({
    clusterId, namespace, resourceType: 'daemonsets', enabled,
  });
  const { data: servicesData, isLoading: svcLoading } = useResourceList({
    clusterId, namespace, resourceType: 'services', enabled,
  });
  const { data: ingressData, isLoading: ingLoading } = useResourceList({
    clusterId, namespace, resourceType: 'ingresses', enabled,
  });

  const isLoading = podsLoading || depsLoading || rsLoading || stsLoading || dsLoading || svcLoading || ingLoading;

  // Create stable dependency keys based on resource UIDs to avoid recomputing
  // the topology when SWR refreshes return identical data
  const podUids = useMemo(
    () => (podsData?.items || []).map((p: KubeResource) => p.metadata?.uid).sort().join(','),
    [podsData]
  );
  const deploymentUids = useMemo(
    () => (deploymentsData?.items || []).map((d: KubeResource) => d.metadata?.uid).sort().join(','),
    [deploymentsData]
  );
  const rsUids = useMemo(
    () => (rsData?.items || []).map((r: KubeResource) => r.metadata?.uid).sort().join(','),
    [rsData]
  );
  const stsUids = useMemo(
    () => (stsData?.items || []).map((s: KubeResource) => s.metadata?.uid).sort().join(','),
    [stsData]
  );
  const dsUids = useMemo(
    () => (dsData?.items || []).map((d: KubeResource) => d.metadata?.uid).sort().join(','),
    [dsData]
  );
  const serviceUids = useMemo(
    () => (servicesData?.items || []).map((s: KubeResource) => s.metadata?.uid).sort().join(','),
    [servicesData]
  );
  const ingressUids = useMemo(
    () => (ingressData?.items || []).map((i: KubeResource) => i.metadata?.uid).sort().join(','),
    [ingressData]
  );

  // Collect unique app labels for filtering UI
  const appLabels = useMemo(() => {
    const labels = new Set<string>();
    const allItems = [
      ...(deploymentsData?.items || []),
      ...(stsData?.items || []),
      ...(dsData?.items || []),
      ...(servicesData?.items || []),
    ];
    for (const item of allItems) {
      const app = getAppLabel(item);
      if (app) labels.add(app);
    }
    return Array.from(labels).sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentUids, stsUids, dsUids, serviceUids]);

  const { nodes, edges } = useMemo((): { nodes: TreeNode[]; edges: TreeEdge[] } => {
    const nodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];
    const nodeIds = new Set<string>();

    const pods: KubeResource[] = podsData?.items || [];
    const deployments: KubeResource[] = deploymentsData?.items || [];
    const replicaSets: KubeResource[] = rsData?.items || [];
    const statefulSets: KubeResource[] = stsData?.items || [];
    const daemonSets: KubeResource[] = dsData?.items || [];
    const services: KubeResource[] = servicesData?.items || [];
    const ingresses: KubeResource[] = ingressData?.items || [];

    const clusterIdEnc = encodeURIComponent(clusterId);
    const basePath = `/clusters/${clusterIdEnc}/namespaces/${namespace}`;

    // App label filter: collect UIDs of matching workloads to include their children
    const filteredWorkloadUids = new Set<string>();
    if (appFilter) {
      for (const dep of deployments) {
        if (getAppLabel(dep) === appFilter && dep.metadata?.uid) filteredWorkloadUids.add(dep.metadata.uid);
      }
      for (const sts of statefulSets) {
        if (getAppLabel(sts) === appFilter && sts.metadata?.uid) filteredWorkloadUids.add(sts.metadata.uid);
      }
      for (const ds of daemonSets) {
        if (getAppLabel(ds) === appFilter && ds.metadata?.uid) filteredWorkloadUids.add(ds.metadata.uid);
      }
    }

    const addNode = (id: string, data: ResourceNodeData) => {
      if (nodeIds.has(id)) return;
      nodeIds.add(id);
      nodes.push({ id, data: { ...data, namespace, clusterId } });
    };

    const addEdge = (source: string, target: string, animated = false) => {
      const id = `${source}->${target}`;
      edges.push({ id, source, target, animated });
    };

    // Build UID → nodeId map for ownerRef linking
    const uidToNodeId: Record<string, string> = {};
    const uid = (r: KubeResource) => r.metadata?.uid || '';

    // If scoped to a specific root resource, filter down
    if (rootKind && rootName) {
      if (rootKind === 'Deployment') {
        const dep = deployments.find(d => d.metadata?.name === rootName);
        if (!dep) return { nodes, edges };
        const depId = `Deployment/${rootName}`;
        uidToNodeId[uid(dep)] = depId;
        addNode(depId, {
          kind: 'Deployment',
          name: rootName,
          health: workloadHealth(dep),
          status: workloadStatus(dep),
          info: `${dep.status?.readyReplicas || 0}/${dep.spec?.replicas || 0} ready`,
          href: `${basePath}/deployments/${rootName}`,
          createdAt: dep.metadata?.creationTimestamp,
          appLabel: getAppLabel(dep),
        });

        // ReplicaSets owned by this deployment
        const ownedRS = replicaSets.filter(rs =>
          rs.metadata?.ownerReferences?.some((ref: KubeOwnerReference) => ref.uid === dep.metadata?.uid)
        );
        for (const rs of ownedRS) {
          const rsId = `ReplicaSet/${rs.metadata?.name}`;
          uidToNodeId[uid(rs)] = rsId;
          addNode(rsId, {
            kind: 'ReplicaSet',
            name: rs.metadata?.name,
            health: rsHealth(rs),
            status: rsStatus(rs),
            info: `${rs.status?.readyReplicas || 0}/${rs.spec?.replicas || 0} ready`,
            href: `${basePath}/replicasets/${rs.metadata?.name}`,
            createdAt: rs.metadata?.creationTimestamp,
          });
          addEdge(depId, rsId);

          // Pods owned by this RS
          const rsPods = pods.filter(p =>
            p.metadata?.ownerReferences?.some((ref: KubeOwnerReference) => ref.uid === rs.metadata?.uid)
          );
          for (const pod of rsPods) {
            const podId = `Pod/${pod.metadata?.name}`;
            addNode(podId, {
              kind: 'Pod',
              name: pod.metadata?.name,
              health: podHealth(pod),
              status: podStatus(pod),
              info: podInfo(pod),
              href: `${basePath}/pods/${pod.metadata?.name}`,
              createdAt: pod.metadata?.creationTimestamp,
            });
            addEdge(rsId, podId);
          }
        }
      } else if (rootKind === 'StatefulSet') {
        const sts = statefulSets.find(s => s.metadata?.name === rootName);
        if (!sts) return { nodes, edges };
        const stsId = `StatefulSet/${rootName}`;
        uidToNodeId[uid(sts)] = stsId;
        addNode(stsId, {
          kind: 'StatefulSet',
          name: rootName,
          health: workloadHealth(sts),
          status: workloadStatus(sts),
          info: `${sts.status?.readyReplicas || 0}/${sts.spec?.replicas || 0} ready`,
          href: `${basePath}/statefulsets/${rootName}`,
          createdAt: sts.metadata?.creationTimestamp,
          appLabel: getAppLabel(sts),
        });

        // Pods owned by this STS
        const stsPods = pods.filter(p =>
          p.metadata?.ownerReferences?.some((ref: KubeOwnerReference) => ref.uid === sts.metadata?.uid)
        );
        for (const pod of stsPods) {
          const podId = `Pod/${pod.metadata?.name}`;
          addNode(podId, {
            kind: 'Pod',
            name: pod.metadata?.name,
            health: podHealth(pod),
            status: podStatus(pod),
            info: podInfo(pod),
            href: `${basePath}/pods/${pod.metadata?.name}`,
            createdAt: pod.metadata?.creationTimestamp,
          });
          addEdge(stsId, podId);
        }
      }

      return { nodes, edges };
    }

    // Full app map: all resources
    // 1. Deployments
    for (const dep of deployments) {
      if (appFilter && getAppLabel(dep) !== appFilter) continue;
      const depId = `Deployment/${dep.metadata?.name}`;
      uidToNodeId[uid(dep)] = depId;
      addNode(depId, {
        kind: 'Deployment',
        name: dep.metadata?.name,
        health: workloadHealth(dep),
        status: workloadStatus(dep),
        info: `${dep.status?.readyReplicas || 0}/${dep.spec?.replicas || 0} ready`,
        href: `${basePath}/deployments/${dep.metadata?.name}`,
        createdAt: dep.metadata?.creationTimestamp,
        appLabel: getAppLabel(dep),
      });
    }

    // 2. StatefulSets
    for (const sts of statefulSets) {
      if (appFilter && getAppLabel(sts) !== appFilter) continue;
      const stsId = `StatefulSet/${sts.metadata?.name}`;
      uidToNodeId[uid(sts)] = stsId;
      addNode(stsId, {
        kind: 'StatefulSet',
        name: sts.metadata?.name,
        health: workloadHealth(sts),
        status: workloadStatus(sts),
        info: `${sts.status?.readyReplicas || 0}/${sts.spec?.replicas || 0} ready`,
        href: `${basePath}/statefulsets/${sts.metadata?.name}`,
        createdAt: sts.metadata?.creationTimestamp,
        appLabel: getAppLabel(sts),
      });
    }

    // 3. DaemonSets
    for (const ds of daemonSets) {
      if (appFilter && getAppLabel(ds) !== appFilter) continue;
      const dsId = `DaemonSet/${ds.metadata?.name}`;
      uidToNodeId[uid(ds)] = dsId;
      addNode(dsId, {
        kind: 'DaemonSet',
        name: ds.metadata?.name,
        health: workloadHealth(ds),
        status: workloadStatus(ds),
        info: `${ds.status?.numberReady || 0}/${ds.status?.desiredNumberScheduled || 0} ready`,
        href: `${basePath}/daemonsets/${ds.metadata?.name}`,
        createdAt: ds.metadata?.creationTimestamp,
        appLabel: getAppLabel(ds),
      });
    }

    // 4. ReplicaSets (only those with > 0 replicas or owned by a known deployment)
    for (const rs of replicaSets) {
      const rsId = `ReplicaSet/${rs.metadata?.name}`;
      uidToNodeId[uid(rs)] = rsId;
      const ownerRef = rs.metadata?.ownerReferences?.find((ref: KubeOwnerReference) => ref.kind === 'Deployment');
      // Skip RS with 0 desired replicas in full map to reduce noise
      if ((rs.spec?.replicas || 0) === 0 && !ownerRef) continue;
      // App filter: only include if owned by a filtered workload
      if (appFilter && ownerRef && !filteredWorkloadUids.has(ownerRef.uid)) continue;
      if (appFilter && !ownerRef && getAppLabel(rs) !== appFilter) continue;
      addNode(rsId, {
        kind: 'ReplicaSet',
        name: rs.metadata?.name,
        health: rsHealth(rs),
        status: rsStatus(rs),
        info: `${rs.status?.readyReplicas || 0}/${rs.spec?.replicas || 0} ready`,
        href: `${basePath}/replicasets/${rs.metadata?.name}`,
        createdAt: rs.metadata?.creationTimestamp,
      });
      if (ownerRef && uidToNodeId[ownerRef.uid]) {
        addEdge(uidToNodeId[ownerRef.uid], rsId);
      }
    }

    // Build set of included RS UIDs for pod filtering
    const includedRsUids = new Set<string>();
    for (const rs of replicaSets) {
      if (nodeIds.has(`ReplicaSet/${rs.metadata?.name}`)) {
        if (rs.metadata?.uid) includedRsUids.add(rs.metadata.uid);
      }
    }

    // 5. Pods
    for (const pod of pods) {
      const ownerRef = pod.metadata?.ownerReferences?.[0];
      // App filter: only include pods owned by included workloads
      if (appFilter) {
        if (ownerRef) {
          const ownerIncluded = filteredWorkloadUids.has(ownerRef.uid) || includedRsUids.has(ownerRef.uid);
          if (!ownerIncluded) continue;
        } else {
          if (getAppLabel(pod) !== appFilter) continue;
        }
      }
      const podId = `Pod/${pod.metadata?.name}`;
      addNode(podId, {
        kind: 'Pod',
        name: pod.metadata?.name,
        health: podHealth(pod),
        status: podStatus(pod),
        info: podInfo(pod),
        href: `${basePath}/pods/${pod.metadata?.name}`,
        createdAt: pod.metadata?.creationTimestamp,
      });
      if (ownerRef && uidToNodeId[ownerRef.uid]) {
        addEdge(uidToNodeId[ownerRef.uid], podId);
      }
    }

    // 6. Services → Pods (via selector matching)
    for (const svc of services) {
      const svcSpec = (svc.spec || {}) as Record<string, unknown>;
      // For app filter: only include services whose selectors match filtered pods
      if (appFilter && getAppLabel(svc) !== appFilter) {
        // Still include if the service selects pods from filtered workloads
        const selector = svcSpec.selector as Record<string, string> | undefined;
        let matchesFiltered = false;
        if (selector) {
          for (const pod of pods) {
            if (labelsMatch(selector, pod.metadata?.labels) && nodeIds.has(`Pod/${pod.metadata?.name}`)) {
              matchesFiltered = true;
              break;
            }
          }
        }
        if (!matchesFiltered) continue;
      }
      const svcPorts = (svcSpec.ports || []) as Array<{ port: number }>;
      const svcId = `Service/${svc.metadata?.name}`;
      addNode(svcId, {
        kind: 'Service',
        name: svc.metadata?.name,
        health: serviceHealth(),
        status: serviceStatus(),
        info: `${svcSpec.type || 'ClusterIP'}${svcPorts[0] ? ` :${svcPorts[0].port}` : ''}`,
        href: `${basePath}/services/${svc.metadata?.name}`,
        createdAt: svc.metadata?.creationTimestamp,
        appLabel: getAppLabel(svc),
      });
      const selector = svcSpec.selector as Record<string, string> | undefined;
      if (selector) {
        const matchedWorkloads = new Set<string>();
        for (const pod of pods) {
          if (labelsMatch(selector, pod.metadata?.labels)) {
            const podOwnerRef = pod.metadata?.ownerReferences?.[0];
            if (podOwnerRef && uidToNodeId[podOwnerRef.uid]) {
              const ownerId = uidToNodeId[podOwnerRef.uid];
              if (podOwnerRef.kind === 'ReplicaSet') {
                const rs = replicaSets.find(r => r.metadata?.uid === podOwnerRef.uid);
                const depRef = rs?.metadata?.ownerReferences?.find((r: KubeOwnerReference) => r.kind === 'Deployment');
                if (depRef && uidToNodeId[depRef.uid]) {
                  matchedWorkloads.add(uidToNodeId[depRef.uid]);
                } else {
                  matchedWorkloads.add(ownerId);
                }
              } else {
                matchedWorkloads.add(ownerId);
              }
            }
          }
        }
        for (const workloadId of matchedWorkloads) {
          addEdge(svcId, workloadId, true);
        }
      }
    }

    // 7. Ingresses → Services
    interface IngressRule { host?: string; http?: { paths?: { path?: string; backend?: { service?: { name?: string } } }[] } }
    for (const ing of ingresses) {
      const ingSpec = (ing.spec || {}) as Record<string, unknown>;
      // For app filter: only include ingresses pointing to included services
      const linkedServices = new Set<string>();
      const ingRules = (ingSpec.rules || []) as IngressRule[];
      for (const rule of ingRules) {
        for (const path of rule.http?.paths || []) {
          const svcName = path.backend?.service?.name;
          if (svcName) linkedServices.add(svcName);
        }
      }
      const defaultBackend = ingSpec.defaultBackend as { service?: { name?: string } } | undefined;
      if (defaultBackend?.service?.name) {
        linkedServices.add(defaultBackend.service.name);
      }
      if (appFilter) {
        const hasIncludedSvc = Array.from(linkedServices).some(svcName => nodeIds.has(`Service/${svcName}`));
        if (!hasIncludedSvc) continue;
      }
      const ingId = `Ingress/${ing.metadata?.name}`;
      addNode(ingId, {
        kind: 'Ingress',
        name: ing.metadata?.name,
        health: ingressHealth(ing),
        status: ingressStatus(ing),
        info: ingRules.map((r) => r.host).filter(Boolean).join(', ') || undefined,
        href: `${basePath}/ingresses/${ing.metadata?.name}`,
        createdAt: ing.metadata?.creationTimestamp,
      });
      for (const svcName of linkedServices) {
        const svcId = `Service/${svcName}`;
        if (nodeIds.has(svcId)) {
          addEdge(ingId, svcId);
        }
      }
    }

    return { nodes, edges };
  // Use stable UID keys instead of raw data objects to prevent unnecessary recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podUids, deploymentUids, rsUids, stsUids, dsUids, serviceUids, ingressUids, clusterId, namespace, rootKind, rootName, appFilter]);

  return { nodes, edges, isLoading, appLabels };
}
