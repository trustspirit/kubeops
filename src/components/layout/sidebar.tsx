'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SIDEBAR_SECTIONS } from '@/lib/constants';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useNamespaceStore } from '@/stores/namespace-store';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const { collapsed, toggleCollapsed } = useSidebarStore();
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = clusterId ? getActiveNamespace(decodeURIComponent(clusterId)) : 'default';

  const handleNavigate = (resourceType: string, clusterScoped?: boolean) => {
    if (!clusterId) return;
    if (!resourceType) {
      router.push(`/clusters/${clusterId}`);
      return;
    }
    if (clusterScoped) {
      router.push(`/clusters/${clusterId}/${resourceType}`);
    } else {
      router.push(`/clusters/${clusterId}/namespaces/${namespace}/${resourceType}`);
    }
  };

  if (!clusterId) return null;

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-200 overflow-hidden',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      <div className="flex items-center justify-end p-2">
        <Button variant="ghost" size="icon" onClick={toggleCollapsed} className="h-7 w-7">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <nav className="flex flex-col gap-1 px-2 pb-4">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.title} className="mb-2">
              {!collapsed && (
                <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.resourceType
                  ? pathname.includes(`/${item.resourceType}`)
                  : pathname === `/clusters/${clusterId}`;
                return (
                  <button
                    key={item.resourceType || 'overview'}
                    onClick={() => handleNavigate(item.resourceType, item.clusterScoped)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
