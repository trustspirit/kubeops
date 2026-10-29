import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { extractK8sError } from '@/lib/k8s/error-handling';
import { isEmptySelector, matchesLabelSelector, selectorToString, type LabelSelector } from '@/lib/k8s/label-selector';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
  }>;
}

interface PodGroupData {
  id: string;
  labels: Record<string, string>;
  pods: string[];
  policies: string[];
}

interface EdgeData {
  from: string;
  to: string;
  direction: 'ingress' | 'egress';
  ports: { port?: number | string; protocol?: string }[];
  policy: string;
}

function selectorToId(selector: LabelSelector | undefined): string {
  return selectorToString(selector) || 'all-pods';
}

/** Adds every pod matching `selector` to `group`; returns the names matched. */
function matchPodsInto(group: PodGroupData, selector: LabelSelector | undefined, pods: k8s.V1Pod[]): string[] {
  const matched: string[] = [];
  for (const pod of pods) {
    const podName = pod.metadata?.name || '';
    if (matchesLabelSelector(selector, pod.metadata?.labels)) {
      if (!group.pods.includes(podName)) group.pods.push(podName);
      matched.push(podName);
    }
  }
  return matched;
}

function extractPorts(ports: k8s.V1NetworkPolicyPort[] | undefined): { port?: number | string; protocol?: string }[] {
  if (!ports || ports.length === 0) return [];
  return ports.map((p: k8s.V1NetworkPolicyPort) => ({
    port: p.port,
    protocol: p.protocol || 'TCP',
  }));
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace') || 'default';

  try {
    const kc = getKubeConfigForContext(contextName);
    const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    // Fetch NetworkPolicies and Pods in parallel
    const [policiesResult, podsResult] = await Promise.all([
      networkingApi.listNamespacedNetworkPolicy({ namespace }),
      coreApi.listNamespacedPod({ namespace }),
    ]);

    const policies: k8s.V1NetworkPolicy[] = policiesResult.items || [];
    const pods: k8s.V1Pod[] = podsResult.items || [];

    // Build pod groups based on NetworkPolicy podSelectors
    const podGroupsMap = new Map<string, PodGroupData>();
    const policyTargetGroups = new Map<string, string>(); // policyName -> groupId

    // Track which pods are matched by any policy
    const matchedPodNames = new Set<string>();

    // Detect default deny policies
    const defaultDeny: { ingress: boolean; egress: boolean } = { ingress: false, egress: false };

    for (const policy of policies) {
      const policyName = policy.metadata?.name || 'unknown';
      const podSelector: LabelSelector | undefined = policy.spec?.podSelector;
      const policyTypes: string[] = policy.spec?.policyTypes || [];
      const groupId = selectorToId(podSelector);

      // Check for default deny (empty podSelector with policyTypes but no rules)
      if (isEmptySelector(podSelector)) {
        const hasIngressRules = policy.spec?.ingress && policy.spec.ingress.length > 0;
        const hasEgressRules = policy.spec?.egress && policy.spec.egress.length > 0;

        if (policyTypes.includes('Ingress') && !hasIngressRules) {
          defaultDeny.ingress = true;
        }
        if (policyTypes.includes('Egress') && !hasEgressRules) {
          defaultDeny.egress = true;
        }
      }

      // Create or update pod group
      if (!podGroupsMap.has(groupId)) {
        podGroupsMap.set(groupId, {
          id: groupId,
          labels: podSelector?.matchLabels || {},
          pods: [],
          policies: [],
        });
      }

      const group = podGroupsMap.get(groupId)!;
      if (!group.policies.includes(policyName)) {
        group.policies.push(policyName);
      }

      policyTargetGroups.set(policyName, groupId);

      // Match pods to this group
      for (const podName of matchPodsInto(group, podSelector, pods)) {
        matchedPodNames.add(podName);
      }
    }

    // Build edges from ingress/egress rules
    const edges: EdgeData[] = [];
    const edgeIds = new Set<string>();

    for (const policy of policies) {
      const policyName = policy.metadata?.name || 'unknown';
      const targetGroupId = policyTargetGroups.get(policyName);
      if (!targetGroupId) continue;

      // Process ingress rules
      const ingressRules = policy.spec?.ingress || [];
      for (const rule of ingressRules) {
        const ports = extractPorts(rule.ports);
        const fromSelectors = rule._from || [];

        if (fromSelectors.length === 0 && ingressRules.length > 0) {
          // Allow all ingress (no "from" means from anywhere)
          const edgeId = `any->ingress->${targetGroupId}/${policyName}`;
          if (!edgeIds.has(edgeId)) {
            edgeIds.add(edgeId);

            // Create "Any" group if it doesn't exist
            if (!podGroupsMap.has('any')) {
              podGroupsMap.set('any', {
                id: 'any',
                labels: {},
                pods: [],
                policies: [],
              });
            }

            edges.push({
              from: 'any',
              to: targetGroupId,
              direction: 'ingress',
              ports,
              policy: policyName,
            });
          }
        }

        for (const from of fromSelectors) {
          if (from.podSelector) {
            const peerSelector: LabelSelector = from.podSelector;
            const fromGroupId = selectorToId(peerSelector);

            // Ensure source group exists
            if (!podGroupsMap.has(fromGroupId)) {
              const group: PodGroupData = {
                id: fromGroupId,
                labels: peerSelector.matchLabels || {},
                pods: [],
                policies: [],
              };
              podGroupsMap.set(fromGroupId, group);
              matchPodsInto(group, peerSelector, pods);
            }

            const edgeId = `${fromGroupId}->ingress->${targetGroupId}/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: fromGroupId,
                to: targetGroupId,
                direction: 'ingress',
                ports,
                policy: policyName,
              });
            }
          }

          if (from.ipBlock) {
            // Create "External" node for ipBlock rules
            const externalId = 'external';
            if (!podGroupsMap.has(externalId)) {
              podGroupsMap.set(externalId, {
                id: externalId,
                labels: {},
                pods: [],
                policies: [],
              });
            }

            const edgeId = `external->ingress->${targetGroupId}/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: externalId,
                to: targetGroupId,
                direction: 'ingress',
                ports,
                policy: policyName,
              });
            }
          }

          if (from.namespaceSelector) {
            // Namespace selector = external namespace traffic
            const nsId = 'external-namespace';
            if (!podGroupsMap.has(nsId)) {
              podGroupsMap.set(nsId, {
                id: nsId,
                labels: from.namespaceSelector.matchLabels || {},
                pods: [],
                policies: [],
              });
            }

            const edgeId = `${nsId}->ingress->${targetGroupId}/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: nsId,
                to: targetGroupId,
                direction: 'ingress',
                ports,
                policy: policyName,
              });
            }
          }
        }
      }

      // Process egress rules
      const egressRules = policy.spec?.egress || [];
      for (const rule of egressRules) {
        const ports = extractPorts(rule.ports);
        const toSelectors = rule.to || [];

        if (toSelectors.length === 0 && egressRules.length > 0) {
          // Allow all egress (no "to" means to anywhere)
          const edgeId = `${targetGroupId}->egress->any/${policyName}`;
          if (!edgeIds.has(edgeId)) {
            edgeIds.add(edgeId);

            if (!podGroupsMap.has('any')) {
              podGroupsMap.set('any', {
                id: 'any',
                labels: {},
                pods: [],
                policies: [],
              });
            }

            edges.push({
              from: targetGroupId,
              to: 'any',
              direction: 'egress',
              ports,
              policy: policyName,
            });
          }
        }

        for (const to of toSelectors) {
          if (to.podSelector) {
            const peerSelector: LabelSelector = to.podSelector;
            const toGroupId = selectorToId(peerSelector);

            // Ensure target group exists
            if (!podGroupsMap.has(toGroupId)) {
              const group: PodGroupData = {
                id: toGroupId,
                labels: peerSelector.matchLabels || {},
                pods: [],
                policies: [],
              };
              podGroupsMap.set(toGroupId, group);
              matchPodsInto(group, peerSelector, pods);
            }

            const edgeId = `${targetGroupId}->egress->${toGroupId}/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: targetGroupId,
                to: toGroupId,
                direction: 'egress',
                ports,
                policy: policyName,
              });
            }
          }

          if (to.ipBlock) {
            const externalId = 'external';
            if (!podGroupsMap.has(externalId)) {
              podGroupsMap.set(externalId, {
                id: externalId,
                labels: {},
                pods: [],
                policies: [],
              });
            }

            const edgeId = `${targetGroupId}->egress->external/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: targetGroupId,
                to: externalId,
                direction: 'egress',
                ports,
                policy: policyName,
              });
            }
          }

          if (to.namespaceSelector) {
            const nsId = 'external-namespace';
            if (!podGroupsMap.has(nsId)) {
              podGroupsMap.set(nsId, {
                id: nsId,
                labels: to.namespaceSelector.matchLabels || {},
                pods: [],
                policies: [],
              });
            }

            const edgeId = `${targetGroupId}->egress->${nsId}/${policyName}`;
            if (!edgeIds.has(edgeId)) {
              edgeIds.add(edgeId);
              edges.push({
                from: targetGroupId,
                to: nsId,
                direction: 'egress',
                ports,
                policy: policyName,
              });
            }
          }
        }
      }
    }

    // Find isolated pods (not matched by any policy)
    const isolatedPods = pods
      .filter((pod) => !matchedPodNames.has(pod.metadata?.name || ''))
      .map((pod) => pod.metadata?.name || '');

    const podGroups = Array.from(podGroupsMap.values());

    return NextResponse.json({
      podGroups,
      edges,
      isolatedPods,
      defaultDeny,
    });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[Network Topology] ${contextName}/${namespace}: ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
