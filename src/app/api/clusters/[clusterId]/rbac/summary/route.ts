import { NextRequest, NextResponse } from 'next/server';
import { getRbacV1Api } from '@/lib/k8s/client-factory';
import { extractK8sError } from '@/lib/k8s/error-handling';
import { RBACEntry } from '@/types/rbac';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const rbacApi = getRbacV1Api(contextName);

    // Fetch all RBAC resources in parallel
    const [
      clusterRoleBindingsRes,
      roleBindingsRes,
      clusterRolesRes,
      rolesRes,
    ] = await Promise.all([
      rbacApi.listClusterRoleBinding(),
      rbacApi.listRoleBindingForAllNamespaces(),
      rbacApi.listClusterRole(),
      rbacApi.listRoleForAllNamespaces(),
    ]);

    const clusterRoleBindings = clusterRoleBindingsRes.items || [];
    const roleBindings = roleBindingsRes.items || [];
    const clusterRoles = clusterRolesRes.items || [];
    const roles = rolesRes.items || [];

    // Build role rules lookup: "ClusterRole:name" -> rules, "Role:namespace/name" -> rules
    const roleRulesMap = new Map<string, Array<{ apiGroups: string[]; resources: string[]; verbs: string[] }>>();

    for (const cr of clusterRoles) {
      const name = cr.metadata?.name || '';
      const rules = (cr.rules || []).map((r) => ({
        apiGroups: r.apiGroups || [''],
        resources: r.resources || [],
        verbs: r.verbs || [],
      }));
      roleRulesMap.set(`ClusterRole:${name}`, rules);
    }

    for (const r of roles) {
      const name = r.metadata?.name || '';
      const ns = r.metadata?.namespace || '';
      const rules = (r.rules || []).map((rule) => ({
        apiGroups: rule.apiGroups || [''],
        resources: rule.resources || [],
        verbs: rule.verbs || [],
      }));
      roleRulesMap.set(`Role:${ns}/${name}`, rules);
    }

    const entries: RBACEntry[] = [];

    // Process ClusterRoleBindings
    for (const crb of clusterRoleBindings) {
      const bindingName = crb.metadata?.name || '';
      const roleRef = crb.roleRef;
      if (!roleRef) continue;

      const roleKey = `${roleRef.kind}:${roleRef.name}`;
      const rules = roleRulesMap.get(roleKey) || [];

      for (const subject of (crb.subjects || [])) {
        entries.push({
          subject: {
            kind: subject.kind,
            name: subject.name,
            namespace: subject.namespace || undefined,
          },
          role: { kind: roleRef.kind, name: roleRef.name },
          namespace: '', // cluster-scoped
          rules,
          bindingName,
          bindingKind: 'ClusterRoleBinding',
        });
      }
    }

    // Process RoleBindings
    for (const rb of roleBindings) {
      const bindingName = rb.metadata?.name || '';
      const bindingNamespace = rb.metadata?.namespace || '';
      const roleRef = rb.roleRef;
      if (!roleRef) continue;

      // RoleBinding can reference a ClusterRole or a Role
      let roleKey: string;
      if (roleRef.kind === 'ClusterRole') {
        roleKey = `ClusterRole:${roleRef.name}`;
      } else {
        roleKey = `Role:${bindingNamespace}/${roleRef.name}`;
      }
      const rules = roleRulesMap.get(roleKey) || [];

      for (const subject of (rb.subjects || [])) {
        entries.push({
          subject: {
            kind: subject.kind,
            name: subject.name,
            namespace: subject.namespace || undefined,
          },
          role: { kind: roleRef.kind, name: roleRef.name },
          namespace: bindingNamespace,
          rules,
          bindingName,
          bindingKind: 'RoleBinding',
        });
      }
    }

    return NextResponse.json({ entries });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET rbac/summary: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
