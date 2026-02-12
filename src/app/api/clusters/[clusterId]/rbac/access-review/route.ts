import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationV1Api } from '@/lib/k8s/client-factory';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractK8sError(error: any): { status: number; message: string } {
  const raw = error?.statusCode || error?.response?.statusCode || error?.code;
  const status = (typeof raw === 'number' && raw >= 200 && raw <= 599) ? raw : 500;

  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }

  const message = body?.message || error?.message || 'Request failed';
  return { status, message };
}

interface AccessReviewRequest {
  user?: string;
  group?: string;
  verb: string;
  resource: string;
  namespace?: string;
  apiGroup?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const body: AccessReviewRequest = await req.json();

    if (!body.verb || !body.resource) {
      return NextResponse.json(
        { error: 'verb and resource are required' },
        { status: 400 }
      );
    }

    const authApi = getAuthorizationV1Api(contextName);

    const result = await authApi.createSubjectAccessReview({
      body: {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SubjectAccessReview',
        spec: {
          resourceAttributes: {
            verb: body.verb,
            resource: body.resource,
            namespace: body.namespace || undefined,
            group: body.apiGroup || '',
          },
          user: body.user || undefined,
          groups: body.group ? [body.group] : undefined,
        },
      },
    });

    return NextResponse.json({
      allowed: result.status?.allowed ?? false,
      reason: result.status?.reason || undefined,
      evaluationError: result.status?.evaluationError || undefined,
    });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] POST rbac/access-review: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
