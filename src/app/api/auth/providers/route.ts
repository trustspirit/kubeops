import { NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getAllProviders } from '@/lib/auth/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = getAllProviders();
  const results = await Promise.all(
    providers.map(async (p) => {
      const availability = await p.checkAvailability();
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        ...availability,
        configFields: p.getConfigFields(),
      };
    })
  );
  return NextResponse.json({ providers: results });
}
