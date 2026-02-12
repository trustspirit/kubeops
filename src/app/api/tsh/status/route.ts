import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

function findTsh(): string | null {
  try {
    return execSync('which tsh', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export async function GET() {
  const tshPath = findTsh();
  if (!tshPath) {
    return NextResponse.json({ loggedIn: false, reason: 'tsh not found' });
  }

  try {
    const output = execSync(`${tshPath} status --format=json`, {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    const data = JSON.parse(output);
    const active = data?.active;
    if (!active?.username) {
      return NextResponse.json({ loggedIn: false });
    }
    return NextResponse.json({
      loggedIn: true,
      username: active.username,
      cluster: active.cluster,
      validUntil: active.valid_until,
    });
  } catch {
    // tsh status fails when not logged in
    return NextResponse.json({ loggedIn: false });
  }
}
