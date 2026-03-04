import { useState, useMemo, useCallback, useEffect } from 'react';

interface UseLogSearchOptions {
  logs: string;
  logRef: React.RefObject<HTMLElement | null>;
  onScrollToMatch?: () => void; // e.g. disable follow mode
}

interface UseLogSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  matchCount: number;
  currentIndex: number;
  goToNext: () => void;
  goToPrev: () => void;
  caseSensitive: boolean;
  toggleCaseSensitive: () => void;
  useRegex: boolean;
  toggleRegex: () => void;
  highlightHtml: (html: string) => string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useLogSearch({ logs, logRef, onScrollToMatch }: UseLogSearchOptions): UseLogSearchReturn {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  // Count matches in raw logs
  const matchCount = useMemo(() => {
    if (!query) return 0;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = useRegex ? query : escapeRegExp(query);
      const regex = new RegExp(pattern, flags);
      const matches = logs.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }, [logs, query, caseSensitive, useRegex]);

  // Reset currentIndex when query or options change
  useEffect(() => {
    setCurrentIndex(0);
  }, [query, caseSensitive, useRegex]);

  const goToNext = useCallback(() => {
    if (matchCount === 0) return;
    const next = (currentIndex + 1) % matchCount;
    setCurrentIndex(next);
    onScrollToMatch?.();
  }, [currentIndex, matchCount, onScrollToMatch]);

  const goToPrev = useCallback(() => {
    if (matchCount === 0) return;
    const prev = (currentIndex - 1 + matchCount) % matchCount;
    setCurrentIndex(prev);
    onScrollToMatch?.();
  }, [currentIndex, matchCount, onScrollToMatch]);

  // Scroll to active match after render
  useEffect(() => {
    if (matchCount === 0 || !logRef.current) return;
    const frame = requestAnimationFrame(() => {
      const el = logRef.current?.querySelector('.log-highlight-active');
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, matchCount, logRef]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const toggleCaseSensitive = useCallback(() => setCaseSensitive((v) => !v), []);
  const toggleRegex = useCallback(() => setUseRegex((v) => !v), []);

  // Highlight search matches in HTML content
  // Only replaces text between > and < (text nodes), not inside HTML tags
  const highlightHtml = useCallback(
    (html: string): string => {
      if (!query) return html;
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        const pattern = useRegex ? query : escapeRegExp(query);
        // Validate regex
        new RegExp(pattern, flags);

        let matchIdx = 0;
        const activeIdx = currentIndex;

        // Match text content between HTML tags (or at start/end)
        return html.replace(/(>[^<]*<)|([^<>]+)/g, (segment) => {
          const isWrapped = segment.startsWith('>') && segment.endsWith('<');
          const prefix = isWrapped ? '>' : '';
          const suffix = isWrapped ? '<' : '';
          const text = isWrapped ? segment.slice(1, -1) : segment;

          if (!text) return segment;

          const replaced = text.replace(new RegExp(pattern, flags), (match) => {
            const cls = matchIdx === activeIdx ? 'log-highlight log-highlight-active' : 'log-highlight';
            const idx = matchIdx;
            matchIdx++;
            return `<mark class="${cls}" data-match-index="${idx}">${match}</mark>`;
          });

          return prefix + replaced + suffix;
        });
      } catch {
        return html;
      }
    },
    [query, caseSensitive, useRegex, currentIndex]
  );

  return {
    query,
    setQuery,
    isOpen,
    open,
    close,
    matchCount,
    currentIndex,
    goToNext,
    goToPrev,
    caseSensitive,
    toggleCaseSensitive,
    useRegex,
    toggleRegex,
    highlightHtml,
  };
}
