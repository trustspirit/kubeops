import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const kc = getKubeConfigForContext(contextName);
    const client = kc.makeApiClient(k8s.ApiextensionsV1Api);
    const result = await client.listCustomResourceDefinition();

    // Transform CRD list into a more frontend-friendly format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crds = (result.items || []).map((crd: any) => {
      const meta = crd.metadata as Record<string, unknown> | undefined;
      const spec = (crd.spec || {}) as Record<string, unknown>;
      const names = (spec.names || {}) as Record<string, string>;
      const versions = (spec.versions || []) as Array<Record<string, unknown>>;
      const servingVersion = versions.find((v) => v.served && v.storage)
        || versions[0]
        || {};
      const printerColumns = servingVersion.additionalPrinterColumns || [];

      return {
        name: meta?.name,
        group: spec.group,
        kind: names.kind,
        plural: names.plural,
        singular: names.singular,
        scope: spec.scope, // Namespaced or Cluster
        version: servingVersion.name,
        versions: versions
          .filter((v) => v.served)
          .map((v) => v.name),
        printerColumns,
      };
    });

    return NextResponse.json({ items: crds });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const response = err?.response as Record<string, unknown> | undefined;
    const body = err?.body as Record<string, unknown> | undefined;
    const status = (err?.statusCode || response?.statusCode || 500) as number;
    const message = (body?.message || err?.message || 'Failed to list CRDs') as string;
    console.error(`[K8s API] GET CRDs: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
