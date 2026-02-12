import { NextRequest, NextResponse } from 'next/server';
import { runHelm, sanitizeSearchKeyword } from '@/lib/helm/helm-runner';
import { requireHelm, parseHelmJson } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

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

  const results = parseHelmJson(result.stdout) ?? [];
  return NextResponse.json({ results });
}
