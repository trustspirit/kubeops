'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { RESOURCE_LABELS } from '@/lib/constants';

export function Breadcrumbs() {
  const params = useParams();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const namespace = params?.namespace as string;

  if (!clusterId) return null;

  const segments: { label: string; href: string }[] = [];

  segments.push({
    label: decodeURIComponent(clusterId),
    href: `/clusters/${clusterId}`,
  });

  if (namespace) {
    segments.push({
      label: namespace,
      href: `/clusters/${clusterId}/namespaces/${namespace}/pods`,
    });
  }

  // Extract resource type from pathname
  const pathParts = pathname.split('/').filter(Boolean);
  const nsIndex = pathParts.indexOf('namespaces');

  if (nsIndex >= 0 && pathParts[nsIndex + 2]) {
    const resourceType = pathParts[nsIndex + 2];
    const label = RESOURCE_LABELS[resourceType] || resourceType;
    segments.push({
      label,
      href: `/clusters/${clusterId}/namespaces/${namespace}/${resourceType}`,
    });

    // Resource name
    if (pathParts[nsIndex + 3]) {
      const resourceName = decodeURIComponent(pathParts[nsIndex + 3]);
      segments.push({
        label: resourceName,
        href: pathname,
      });

      // Sub-page (logs, exec)
      if (pathParts[nsIndex + 4]) {
        segments.push({
          label: pathParts[nsIndex + 4].charAt(0).toUpperCase() + pathParts[nsIndex + 4].slice(1),
          href: pathname,
        });
      }
    }
  } else {
    // Cluster-scoped resources
    const clusterIdx = pathParts.indexOf(decodeURIComponent(clusterId));
    if (clusterIdx >= 0 && pathParts[clusterIdx + 1] && pathParts[clusterIdx + 1] !== 'namespaces') {
      const resourceType = pathParts[clusterIdx + 1];
      const label = RESOURCE_LABELS[resourceType] || resourceType;
      segments.push({
        label,
        href: `/clusters/${clusterId}/${resourceType}`,
      });

      if (pathParts[clusterIdx + 2]) {
        segments.push({
          label: decodeURIComponent(pathParts[clusterIdx + 2]),
          href: pathname,
        });
      }
    }
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground px-6 pt-4">
      <Link href="/clusters" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, i) => (
        <div key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {i === segments.length - 1 ? (
            <span className="text-foreground font-medium truncate max-w-[200px]">{segment.label}</span>
          ) : (
            <Link href={segment.href} className="hover:text-foreground transition-colors truncate max-w-[200px]">
              {segment.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
