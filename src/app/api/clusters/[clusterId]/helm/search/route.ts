import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable, sanitizeSearchKeyword } from '@/lib/helm/helm-runner';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawKeyword = searchParams.get('keyword') || '';
  const source = searchParams.get('source') || 'repo';

  if (!['repo', 'hub'].includes(source)) {
    return NextResponse.json({ error: 'Invalid search source. Use "repo" or "hub".' }, { status: 400 });
  }

  const keyword = sanitizeSearchKeyword(rawKeyword);
  if (!keyword) {
    return NextResponse.json({ results: [] });
  }

  const args = ['search', source, keyword, '--output', 'json'];
  const result = await runHelm(args);

  if (result.code !== 0) {
    // search returning no results may return an error
    if (result.stderr.includes('no results found') || result.stderr.includes('failed to fetch')) {
      return NextResponse.json({ results: [] });
    }
    console.error(`[Helm] search ${source} "${keyword}" failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to search charts for "${keyword}"` },
      { status: 500 }
    );
  }

  try {
    const results = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Helm output' },
      { status: 500 }
    );
  }
}
