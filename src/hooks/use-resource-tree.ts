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

export function useResourceTree({ clusterId, namespace, rootKind, rootName }: UseResourceTreeOptions) {
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
          info: `${dep.status?.readyReplicas || 0}/${dep.spec?.replicas || 0} ready`,
          href: `${basePath}/deployments/${rootName}`,
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
            info: `${rs.status?.readyReplicas || 0}/${rs.spec?.replicas || 0} ready`,
            href: `${basePath}/replicasets/${rs.metadata?.name}`,
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
              info: podInfo(pod),
              href: `${basePath}/pods/${pod.metadata?.name}`,
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
          info: `${sts.status?.readyReplicas || 0}/${sts.spec?.replicas || 0} ready`,
          href: `${basePath}/statefulsets/${rootName}`,
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
            info: podInfo(pod),
            href: `${basePath}/pods/${pod.metadata?.name}`,
          });
          addEdge(stsId, podId);
        }
      }

      return { nodes, edges };
    }

    // Full app map: all resources
    // 1. Deployments
    for (const dep of deployments) {
      const depId = `Deployment/${dep.metadata?.name}`;
      uidToNodeId[dep.metadata?.uid] = depId;
      addNode(depId, {
        kind: 'Deployment',
        name: dep.metadata?.name,
        health: workloadHealth(dep),
        info: `${dep.status?.readyReplicas || 0}/${dep.spec?.replicas || 0} ready`,
        href: `${basePath}/deployments/${dep.metadata?.name}`,
      });
    }

    // 2. StatefulSets
    for (const sts of statefulSets) {
      const stsId = `StatefulSet/${sts.metadata?.name}`;
      uidToNodeId[sts.metadata?.uid] = stsId;
      addNode(stsId, {
        kind: 'StatefulSet',
        name: sts.metadata?.name,
        health: workloadHealth(sts),
        info: `${sts.status?.readyReplicas || 0}/${sts.spec?.replicas || 0} ready`,
        href: `${basePath}/statefulsets/${sts.metadata?.name}`,
      });
    }

    // 3. DaemonSets
    for (const ds of daemonSets) {
      const dsId = `DaemonSet/${ds.metadata?.name}`;
      uidToNodeId[ds.metadata?.uid] = dsId;
      addNode(dsId, {
        kind: 'DaemonSet',
        name: ds.metadata?.name,
        health: workloadHealth(ds),
        info: `${ds.status?.numberReady || 0}/${ds.status?.desiredNumberScheduled || 0} ready`,
        href: `${basePath}/daemonsets/${ds.metadata?.name}`,
      });
    }

    // 4. ReplicaSets (only those with > 0 replicas or owned by a known deployment)
    for (const rs of replicaSets) {
      const rsId = `ReplicaSet/${rs.metadata?.name}`;
      uidToNodeId[rs.metadata?.uid] = rsId;
      const ownerRef = rs.metadata?.ownerReferences?.find((ref: any) => ref.kind === 'Deployment');
      // Skip RS with 0 desired replicas in full map to reduce noise
      if ((rs.spec?.replicas || 0) === 0 && !ownerRef) continue;
      addNode(rsId, {
        kind: 'ReplicaSet',
        name: rs.metadata?.name,
        health: rsHealth(rs),
        info: `${rs.status?.readyReplicas || 0}/${rs.spec?.replicas || 0} ready`,
        href: `${basePath}/replicasets/${rs.metadata?.name}`,
      });
      if (ownerRef && uidToNodeId[ownerRef.uid]) {
        addEdge(uidToNodeId[ownerRef.uid], rsId);
      }
    }

    // 5. Pods
    for (const pod of pods) {
      const podId = `Pod/${pod.metadata?.name}`;
      addNode(podId, {
        kind: 'Pod',
        name: pod.metadata?.name,
        health: podHealth(pod),
        info: podInfo(pod),
        href: `${basePath}/pods/${pod.metadata?.name}`,
      });
      // Link to owner
      const ownerRef = pod.metadata?.ownerReferences?.[0];
      if (ownerRef && uidToNodeId[ownerRef.uid]) {
        addEdge(uidToNodeId[ownerRef.uid], podId);
      }
    }

    // 6. Services → Pods (via selector matching)
    for (const svc of services) {
      const svcId = `Service/${svc.metadata?.name}`;
      addNode(svcId, {
        kind: 'Service',
        name: svc.metadata?.name,
        health: serviceHealth(),
        info: `${svc.spec?.type || 'ClusterIP'}${svc.spec?.ports?.[0] ? ` :${svc.spec.ports[0].port}` : ''}`,
        href: `${basePath}/services/${svc.metadata?.name}`,
      });
      const selector = svc.spec?.selector;
      if (selector) {
        // Find pods matching the selector and link through workload owners
        const matchedWorkloads = new Set<string>();
        for (const pod of pods) {
          if (labelsMatch(selector, pod.metadata?.labels)) {
            const ownerRef = pod.metadata?.ownerReferences?.[0];
            if (ownerRef && uidToNodeId[ownerRef.uid]) {
              // Link service to the workload owner (RS/STS/DS), not directly to pods
              const ownerId = uidToNodeId[ownerRef.uid];
              // If the owner is an RS, try to link to its Deployment instead
              if (ownerRef.kind === 'ReplicaSet') {
                const rs = replicaSets.find(r => r.metadata?.uid === ownerRef.uid);
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
      const ingId = `Ingress/${ing.metadata?.name}`;
      addNode(ingId, {
        kind: 'Ingress',
        name: ing.metadata?.name,
        health: ingressHealth(ing),
        info: (ing.spec?.rules || []).map((r: any) => r.host).filter(Boolean).join(', ') || undefined,
        href: `${basePath}/ingresses/${ing.metadata?.name}`,
      });
      // Link to backend services
      const linkedServices = new Set<string>();
      for (const rule of ing.spec?.rules || []) {
        for (const path of rule.http?.paths || []) {
          const svcName = path.backend?.service?.name;
          if (svcName) linkedServices.add(svcName);
        }
      }
      // Default backend
      if (ing.spec?.defaultBackend?.service?.name) {
        linkedServices.add(ing.spec.defaultBackend.service.name);
      }
      for (const svcName of linkedServices) {
        const svcId = `Service/${svcName}`;
        if (nodeIds.has(svcId)) {
          addEdge(ingId, svcId);
        }
      }
    }

    return { nodes, edges };
  }, [podsData, deploymentsData, rsData, stsData, dsData, servicesData, ingressData, clusterId, namespace, rootKind, rootName]);

  return { nodes, edges, isLoading };
}
