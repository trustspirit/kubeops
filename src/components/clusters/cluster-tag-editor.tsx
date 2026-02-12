'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, X, Plus } from 'lucide-react';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';

interface ClusterTagEditorProps {
  contextName: string;
}

export function ClusterTagEditor({ contextName }: ClusterTagEditorProps) {
  const { getClusterMeta, setGroup, addTag, removeTag, groups, addGroup } = useClusterCatalogStore();
  const meta = getClusterMeta(contextName);
  const [newTag, setNewTag] = useState('');
  const [newGroup, setNewGroup] = useState('');

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag) {
      addTag(contextName, tag);
      setNewTag('');
    }
  };

  const handleAddGroup = () => {
    const group = newGroup.trim();
    if (group) {
      addGroup(group);
      setGroup(contextName, group);
      setNewGroup('');
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Group</label>
            <Select value={meta.group || '_none'} onValueChange={(v) => setGroup(contextName, v === '_none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 mt-1">
              <Input
                placeholder="New group..."
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                className="h-7 text-xs"
              />
              <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddGroup} disabled={!newGroup.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {meta.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                  {tag}
                  <button onClick={() => removeTag(contextName, tag)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              <Input
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                className="h-7 text-xs"
              />
              <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddTag} disabled={!newTag.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
