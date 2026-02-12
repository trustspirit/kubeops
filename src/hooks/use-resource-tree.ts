import { useMemo } from 'react';
import { useResourceList } from './use-resource-list';
import type { ResourceNodeData } from '@/components/shared/resource-node';

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

function getAppLabel(resource: any): string | undefined {
  const labels = resource.metadata?.labels;
  if (!labels) return undefined;
  return labels['app.kubernetes.io/name'] || labels['app'] || labels['app.kubernetes.io/instance'];
}

function podHealth(pod: any): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  if (pod.metadata?.deletionTimestamp) return 'Progressing';
  const phase = pod.status?.phase;
  if (phase === 'Succeeded') return 'Healthy';
  if (phase === 'Failed') return 'Degraded';
  if (phase === 'Pending') return 'Progressing';
  const statuses = pod.status?.containerStatuses || [];
  if (statuses.length === 0) return 'Progressing';
  const allReady = statuses.every((c: any) => c.ready);
  if (allReady) return 'Healthy';
  const anyWaiting = statuses.some((c: any) => c.state?.waiting?.reason === 'CrashLoopBackOff' || c.state?.waiting?.reason === 'ImagePullBackOff' || c.state?.waiting?.reason === 'ErrImagePull');
  if (anyWaiting) return 'Degraded';
  return 'Progressing';
}

function workloadHealth(resource: any): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  const spec = resource.spec || {};
  const status = resource.status || {};
  const desired = spec.replicas ?? 1;
  const ready = status.readyReplicas || 0;
  if (ready >= desired && desired > 0) return 'Healthy';
  if (ready > 0) return 'Progressing';
  if (desired === 0) return 'Healthy';
  return 'Degraded';
}

function rsHealth(rs: any): 'Healthy' | 'Progressing' | 'Degraded' | 'Unknown' {
  const desired = rs.spec?.replicas ?? 0;
  const ready = rs.status?.readyReplicas || 0;
  if (desired === 0) return 'Healthy';
  if (ready >= desired) return 'Healthy';
  if (ready > 0) return 'Progressing';
  return 'Degraded';
}

function serviceHealth(): 'Healthy' {
  return 'Healthy';
}

function ingressHealth(ingress: any): 'Healthy' | 'Progressing' {
  const lbIngress = ingress.status?.loadBalancer?.ingress;
  if (lbIngress && lbIngress.length > 0) return 'Healthy';
  return 'Progressing';
}

function podStatus(pod: any): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  const phase = pod.status?.phase;
  const containerStatuses: any[] = pod.status?.containerStatuses || [];

  // Check waiting containers first
  for (const cs of containerStatuses) {
    const waitingReason = cs.state?.waiting?.reason;
    if (waitingReason) return waitingReason; // CrashLoopBackOff, ImagePullBackOff, ErrImagePull, ContainerCreating, etc.
  }

  // Check terminated containers
  for (const cs of containerStatuses) {
    const terminatedReason = cs.state?.terminated?.reason;
    if (terminatedReason) return terminatedReason; // OOMKilled, Error, Completed, etc.
  }

  if (phase === 'Pending' && containerStatuses.length === 0) return 'Pending';
  if (phase === 'Succeeded') return 'Completed';
  if (phase === 'Failed') return 'Failed';
  if (phase === 'Running') {
    const allReady = containerStatuses.every((c: any) => c.ready);
    if (allReady) return 'Running';
  }
  return 'Progressing';
}

function workloadStatus(resource: any): string {
  const spec = resource.spec || {};
  const status = resource.status || {};
  const desired = spec.replicas ?? 1;
  const ready = status.readyReplicas || 0;
  if (desired === 0) return 'Scaled to 0';
  if (ready >= desired) return 'Healthy';
  const updated = status.updatedReplicas || 0;
  if (updated < desired) return 'Updating';
  if (ready > 0) return 'ScalingUp';
  return 'Degraded';
}

function rsStatus(rs: any): string {
  const desired = rs.spec?.replicas ?? 0;
  const ready = rs.status?.readyReplicas || 0;
  if (desired === 0) return 'Scaled to 0';
  if (ready >= desired) return 'Active';
  return 'ScalingUp';
}

function serviceStatus(): string {
  return 'Active';
}

function ingressStatus(ingress: any): string {
  const lbIngress = ingress.status?.loadBalancer?.ingress;
  if (lbIngress && lbIngress.length > 0) return 'Active';
  return 'Pending';
}

function podInfo(pod: any): string {
  const statuses = pod.status?.containerStatuses || [];
  const readyCt = statuses.filter((c: any) => c.ready).length;
  const totalCt = statuses.length || pod.spec?.containers?.length || 0;
  const restarts = statuses.reduce((s: number, c: any) => s + (c.restartCount || 0), 0);
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
    () => (podsData?.items || []).map((p: any) => p.metadata?.uid).sort().join(','),
    [podsData]
  );
  const deploymentUids = useMemo(
    () => (deploymentsData?.items || []).map((d: any) => d.metadata?.uid).sort().join(','),
    [deploymentsData]
  );
  const rsUids = useMemo(
    () => (rsData?.items || []).map((r: any) => r.metadata?.uid).sort().join(','),
    [rsData]
  );
  const stsUids = useMemo(
    () => (stsData?.items || []).map((s: any) => s.metadata?.uid).sort().join(','),
    [stsData]
  );
  const dsUids = useMemo(
    () => (dsData?.items || []).map((d: any) => d.metadata?.uid).sort().join(','),
    [dsData]
  );
  const serviceUids = useMemo(
    () => (servicesData?.items || []).map((s: any) => s.metadata?.uid).sort().join(','),
    [servicesData]
  );
  const ingressUids = useMemo(
    () => (ingressData?.items || []).map((i: any) => i.metadata?.uid).sort().join(','),
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

  const { nodes, edges } = useMemo(() => {
    const nodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];
    const nodeIds = new Set<string>();

    const pods: any[] = podsData?.items || [];
    const deployments: any[] = deploymentsData?.items || [];
    const replicaSets: any[] = rsData?.items || [];
    const statefulSets: any[] = stsData?.items || [];
    const daemonSets: any[] = dsData?.items || [];
    const services: any[] = servicesData?.items || [];
    const ingresses: any[] = ingressData?.items || [];

    const clusterIdEnc = encodeURIComponent(clusterId);
    const basePath = `/clusters/${clusterIdEnc}/namespaces/${namespace}`;

    // App label filter: collect UIDs of matching workloads to include their children
    const filteredWorkloadUids = new Set<string>();
    if (appFilter) {
      for (const dep of deployments) {
        if (getAppLabel(dep) === appFilter) filteredWorkloadUids.add(dep.metadata?.uid);
      }
      for (const sts of statefulSets) {
        if (getAppLabel(sts) === appFilter) filteredWorkloadUids.add(sts.metadata?.uid);
      }
      for (const ds of daemonSets) {
        if (getAppLabel(ds) === appFilter) filteredWorkloadUids.add(ds.metadata?.uid);
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

    // If scoped to a specific root resource, filter down
    if (rootKind && rootName) {
      if (rootKind === 'Deployment') {
        const dep = deployments.find(d => d.metadata?.name === rootName);
        if (!dep) return { nodes, edges };
        const depId = `Deployment/${rootName}`;
        uidToNodeId[dep.metadata?.uid] = depId;
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
          rs.metadata?.ownerReferences?.some((ref: any) => ref.uid === dep.metadata?.uid)
        );
        for (const rs of ownedRS) {
          const rsId = `ReplicaSet/${rs.metadata?.name}`;
          uidToNodeId[rs.metadata?.uid] = rsId;
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
            p.metadata?.ownerReferences?.some((ref: any) => ref.uid === rs.metadata?.uid)
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
        uidToNodeId[sts.metadata?.uid] = stsId;
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
          p.metadata?.ownerReferences?.some((ref: any) => ref.uid === sts.metadata?.uid)
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
      uidToNodeId[dep.metadata?.uid] = depId;
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
      uidToNodeId[sts.metadata?.uid] = stsId;
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
      uidToNodeId[ds.metadata?.uid] = dsId;
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
      uidToNodeId[rs.metadata?.uid] = rsId;
      const ownerRef = rs.metadata?.ownerReferences?.find((ref: any) => ref.kind === 'Deployment');
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
        includedRsUids.add(rs.metadata?.uid);
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
      // For app filter: only include services whose selectors match filtered pods
      if (appFilter && getAppLabel(svc) !== appFilter) {
        // Still include if the service selects pods from filtered workloads
        const selector = svc.spec?.selector;
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
      const svcId = `Service/${svc.metadata?.name}`;
      addNode(svcId, {
        kind: 'Service',
        name: svc.metadata?.name,
        health: serviceHealth(),
        status: serviceStatus(),
        info: `${svc.spec?.type || 'ClusterIP'}${svc.spec?.ports?.[0] ? ` :${svc.spec.ports[0].port}` : ''}`,
        href: `${basePath}/services/${svc.metadata?.name}`,
        createdAt: svc.metadata?.creationTimestamp,
        appLabel: getAppLabel(svc),
      });
      const selector = svc.spec?.selector;
      if (selector) {
        const matchedWorkloads = new Set<string>();
        for (const pod of pods) {
          if (labelsMatch(selector, pod.metadata?.labels)) {
            const podOwnerRef = pod.metadata?.ownerReferences?.[0];
            if (podOwnerRef && uidToNodeId[podOwnerRef.uid]) {
              const ownerId = uidToNodeId[podOwnerRef.uid];
              if (podOwnerRef.kind === 'ReplicaSet') {
                const rs = replicaSets.find(r => r.metadata?.uid === podOwnerRef.uid);
                const depRef = rs?.metadata?.ownerReferences?.find((r: any) => r.kind === 'Deployment');
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
    for (const ing of ingresses) {
      // For app filter: only include ingresses pointing to included services
      const linkedServices = new Set<string>();
      for (const rule of ing.spec?.rules || []) {
        for (const path of rule.http?.paths || []) {
          const svcName = path.backend?.service?.name;
          if (svcName) linkedServices.add(svcName);
        }
      }
      if (ing.spec?.defaultBackend?.service?.name) {
        linkedServices.add(ing.spec.defaultBackend.service.name);
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
        info: (ing.spec?.rules || []).map((r: any) => r.host).filter(Boolean).join(', ') || undefined,
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
