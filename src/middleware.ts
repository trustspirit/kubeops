import { NextResponse, type NextRequest } from 'next/server';
import { isSameOriginRequest } from '@/lib/local-server-security';

/**
 * Rejects state-changing API calls that did not originate from the KubeOps
 * window itself. See `isSameOriginRequest` for why a loopback-only bind is not
 * enough on its own.
 */
export function middleware(req: NextRequest) {
  const allowed = isSameOriginRequest({
    method: req.method,
    host: req.headers.get('host') ?? undefined,
    origin: req.headers.get('origin'),
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Cross-origin request rejected' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
