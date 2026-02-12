'use client';

import { useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { cn } from '@/lib/utils';

interface YamlDiffViewProps {
  original: string;
  modified: string;
}

export function YamlDiffView({ original, modified }: YamlDiffViewProps) {
  const changes = useMemo(() => diffLines(original, modified), [original, modified]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.added) added += c.count || 0;
      if (c.removed) removed += c.count || 0;
    }
    return { added, removed };
  }, [changes]);

  const lines = useMemo(() => {
    const result: { type: 'added' | 'removed' | 'unchanged'; text: string; oldNum?: number; newNum?: number }[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (const change of changes) {
      const lineTexts = change.value.split('\n');
      // diffLines includes trailing newline, so last element is empty
      if (lineTexts[lineTexts.length - 1] === '') lineTexts.pop();

      for (const text of lineTexts) {
        if (change.added) {
          result.push({ type: 'added', text, newNum: newLine });
          newLine++;
        } else if (change.removed) {
          result.push({ type: 'removed', text, oldNum: oldLine });
          oldLine++;
        } else {
          result.push({ type: 'unchanged', text, oldNum: oldLine, newNum: newLine });
          oldLine++;
          newLine++;
        }
      }
    }

    return result;
  }, [changes]);

  const MAX_VISIBLE = 3000;
  const [showAll, setShowAll] = useState(false);
  const truncated = !showAll && lines.length > MAX_VISIBLE;
  const visibleLines = truncated ? lines.slice(0, MAX_VISIBLE) : lines;

  const hasChanges = stats.added > 0 || stats.removed > 0;

  if (!hasChanges) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No changes detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-green-600 dark:text-green-400 font-medium">+{stats.added} additions</span>
        <span className="text-red-600 dark:text-red-400 font-medium">-{stats.removed} deletions</span>
      </div>

      <div className="rounded-md border overflow-auto max-h-[70vh]">
        <table className="w-full text-xs font-mono border-collapse">
          <tbody>
            {visibleLines.map((line, i) => (
              <tr
                key={i}
                className={cn(
                  line.type === 'added' && 'bg-green-500/10',
                  line.type === 'removed' && 'bg-red-500/10',
                )}
              >
                <td className="w-[1px] px-1.5 py-0 text-right text-muted-foreground/50 select-none border-r whitespace-nowrap">
                  {line.oldNum ?? ''}
                </td>
                <td className="w-[1px] px-1.5 py-0 text-right text-muted-foreground/50 select-none border-r whitespace-nowrap">
                  {line.newNum ?? ''}
                </td>
                <td className={cn(
                  'w-[1px] px-1.5 py-0 select-none font-bold',
                  line.type === 'added' && 'text-green-600 dark:text-green-400',
                  line.type === 'removed' && 'text-red-600 dark:text-red-400',
                )}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>
                <td className="px-2 py-0 whitespace-pre">{line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && (
          <div className="p-2 text-center border-t">
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show all {lines.length} lines ({lines.length - MAX_VISIBLE} more)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
