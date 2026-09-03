import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-12 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That route does not exist in KubeOps.
        </p>
      </div>
      <Link href="/clusters" className="text-sm text-primary hover:underline">
        Back to clusters
      </Link>
    </div>
  );
}
