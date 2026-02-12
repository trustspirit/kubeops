'use client';

import { useState, useMemo, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RBACEntry, SUBJECT_KIND_COLORS, VERB_COLORS } from '@/types/rbac';

interface RBACSummaryProps {
  entries: RBACEntry[];
  isLoading: boolean;
}

export function RBACSummary({ entries, isLoading }: RBACSummaryProps) {
  const [search, setSearch] = useState('');
  const [subjectKindFilter, setSubjectKindFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filteredEntries = useMemo(() => {
    let filtered = entries;

    if (subjectKindFilter !== 'all') {
      filtered = filtered.filter((e) => e.subject.kind === subjectKindFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.subject.name.toLowerCase().includes(q) ||
          e.role.name.toLowerCase().includes(q) ||
          e.namespace.toLowerCase().includes(q) ||
          e.bindingName.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [entries, search, subjectKindFilter]);

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getRowKey = (entry: RBACEntry, index: number) =>
    `${entry.subject.kind}:${entry.subject.name}:${entry.bindingKind}:${entry.bindingName}:${index}`;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by subject, role, namespace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={subjectKindFilter} onValueChange={setSubjectKindFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Subject Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="User">User</SelectItem>
              <SelectItem value="Group">Group</SelectItem>
              <SelectItem value="ServiceAccount">ServiceAccount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground ml-auto">
          {filteredEntries.length} of {entries.length} bindings
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Binding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {entries.length === 0
                    ? 'No RBAC bindings found in this cluster.'
                    : 'No bindings match the current filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry, index) => {
                const rowKey = getRowKey(entry, index);
                const isExpanded = expandedRows.has(rowKey);
                const hasRules = entry.rules.length > 0;

                return (
                  <Fragment key={rowKey}>
                    <TableRow className="group">
                      <TableCell>
                        {hasRules && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleRow(rowKey)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium font-mono text-xs">
                            {entry.subject.name}
                          </span>
                          {entry.subject.namespace && (
                            <span className="text-[10px] text-muted-foreground">
                              ns: {entry.subject.namespace}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] py-0 h-5',
                            SUBJECT_KIND_COLORS[entry.subject.kind] || ''
                          )}
                        >
                          {entry.subject.kind}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] py-0 h-5">
                            {entry.role.kind}
                          </Badge>
                          <span className="font-mono text-xs">{entry.role.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.namespace ? (
                          <Badge variant="outline" className="text-[10px] py-0 h-5 font-mono">
                            {entry.namespace}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 h-5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                          >
                            Cluster-wide
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground font-mono">
                          {entry.bindingName}
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Expanded rules row */}
                    {isExpanded && hasRules && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="p-0">
                          <div className="bg-muted/30 px-6 py-4 border-t">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-semibold">
                                Permission Rules
                              </span>
                              <Badge variant="outline" className="text-[10px] py-0 h-5">
                                {entry.rules.length} rule{entry.rules.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {entry.rules.map((rule, ruleIndex) => (
                                <div
                                  key={ruleIndex}
                                  className="rounded-md border bg-background p-3 text-xs space-y-1.5"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground w-20 shrink-0 font-medium">
                                      Verbs:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {rule.verbs.map((verb) => (
                                        <Badge
                                          key={verb}
                                          variant="secondary"
                                          className={cn(
                                            'text-[10px] py-0 h-4 font-mono',
                                            VERB_COLORS[verb] || ''
                                          )}
                                        >
                                          {verb}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground w-20 shrink-0 font-medium">
                                      Resources:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {rule.resources.map((res) => (
                                        <Badge
                                          key={res}
                                          variant="outline"
                                          className="text-[10px] py-0 h-4 font-mono"
                                        >
                                          {res}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground w-20 shrink-0 font-medium">
                                      API Groups:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {rule.apiGroups.map((group, gIdx) => (
                                        <Badge
                                          key={`${group || 'core'}-${gIdx}`}
                                          variant="outline"
                                          className="text-[10px] py-0 h-4 font-mono"
                                        >
                                          {group || 'core'}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
