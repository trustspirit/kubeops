import { getContexts } from '@/lib/k8s/kubeconfig-manager';
import { checkClusterStatus } from '@/lib/k8s/cluster-status-cache';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint that streams cluster health status as each check completes.
 * Each event: { name, status, error }
 * Final event: { done: true }
 */
export async function GET() {
  const encoder = new TextEncoder();
  const contexts = getContexts();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const tryEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const tryClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by client disconnect
        }
      };

      const checks = contexts.map(async (ctx) => {
        const entry = await checkClusterStatus(ctx.name);
        const payload = JSON.stringify({
          name: ctx.name,
          status: entry.status,
          error: entry.error ?? null,
        });
        tryEnqueue(encoder.encode(`data: ${payload}\n\n`));
      });

      Promise.all(checks)
        .then(() => {
          tryEnqueue(encoder.encode('data: {"done":true}\n\n'));
          tryClose();
        })
        .catch(tryClose);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
