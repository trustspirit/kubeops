'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useNamespaceStore } from '@/stores/namespace-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderOpen } from 'lucide-react';

export function NamespaceSelector() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : null;
  const { namespaces, isLoading } = useNamespaces(decodedClusterId);
  const { setActiveNamespace, getActiveNamespace } = useNamespaceStore();

  const activeNamespace = decodedClusterId ? getActiveNamespace(decodedClusterId) : 'default';

  const handleChange = (value: string) => {
    if (!decodedClusterId) return;
    setActiveNamespace(decodedClusterId, value);
    // If currently viewing a namespaced resource, navigate to the same resource type in the new namespace
    const nsMatch = pathname.match(/\/namespaces\/[^/]+\/([^/]+)/);
    if (nsMatch && clusterId) {
      router.push(`/clusters/${clusterId}/namespaces/${value}/${nsMatch[1]}`);
    }
  };

  if (!clusterId) return null;

  return (
    <Select value={activeNamespace} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] h-8">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5" />
          <SelectValue placeholder={isLoading ? 'Loading...' : 'Select namespace'} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {namespaces.map((ns: { name: string }) => (
          <SelectItem key={ns.name} value={ns.name}>
            {ns.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
