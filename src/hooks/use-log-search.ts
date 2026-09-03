import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

interface UseLogSearchOptions {
  /** ANSI-converted, XML-escaped HTML — the same string that gets rendered. */
  html: string;
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
  regexError: string | null;
  /** HTML with matches wrapped in <mark>. */
  highlightedHtml: string;
}

/** Debounce so a regex is not recompiled and re-run on every keystroke. */
const SEARCH_DEBOUNCE_MS = 200;
/** Hard ceiling on highlights so a pathological pattern cannot lock the tab. */
const MAX_MATCHES = 5000;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits HTML into runs of markup and runs of text content, so matches are only
 * ever inserted into text nodes.
 */
const HTML_SEGMENT = /(<[^>]*>)|([^<]+)/g;

interface HighlightResult {
  html: string;
  matchCount: number;
}

export function highlightMatches(
  html: string,
  pattern: string,
  flags: string,
  activeIndex: number,
): HighlightResult {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    return { html, matchCount: 0 };
  }

  let matchIdx = 0;

  const out = html.replace(HTML_SEGMENT, (segment, tag: string | undefined, text: string | undefined) => {
    if (tag !== undefined || text === undefined) return segment;
    if (matchIdx >= MAX_MATCHES) return segment;

    // Run the pattern one line at a time. Backtracking cost grows superlinearly
    // with input length, so bounding each attempt to a single line keeps a
    // user-supplied regex from freezing the renderer on a 512KB buffer.
    return text
      .split(/(?<=\n)/)
      .map((line) => {
        if (matchIdx >= MAX_MATCHES) return line;
        regex.lastIndex = 0;
        return line.replace(regex, (match: string) => {
          if (matchIdx >= MAX_MATCHES || match === '') return match;
          const cls = matchIdx === activeIndex ? 'log-highlight log-highlight-active' : 'log-highlight';
          const idx = matchIdx;
          matchIdx++;
          return `<mark class="${cls}" data-match-index="${idx}">${match}</mark>`;
        });
      })
      .join('');
  });

  return { html: out, matchCount: matchIdx };
}

export function useLogSearch({ html, logRef, onScrollToMatch }: UseLogSearchOptions): UseLogSearchReturn {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  // The selection is stamped with the search it belongs to, so changing the
  // query resets the cursor during render rather than through an effect.
  const [selection, setSelection] = useState({ token: '', index: 0 });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const regexError = useMemo(() => {
    if (!useRegex || !debouncedQuery) return null;
    try {
      new RegExp(debouncedQuery);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid regular expression';
    }
  }, [useRegex, debouncedQuery]);

  // Highlighting and counting are one pass over the same string, so the
  // "n of m" counter can never disagree with what is actually marked up. The
  // old code counted matches in the raw logs and highlighted the escaped HTML,
  // which diverged for anything containing <, > or &.
  const searchToken = `${debouncedQuery}\u0000${caseSensitive}\u0000${useRegex}`;
  const requestedIndex = selection.token === searchToken ? selection.index : 0;

  const { html: highlightedHtml, matchCount, currentIndex } = useMemo(() => {
    if (!debouncedQuery || regexError) return { html, matchCount: 0, currentIndex: 0 };
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = useRegex ? debouncedQuery : escapeRegExp(debouncedQuery);

    const first = highlightMatches(html, pattern, flags, requestedIndex);
    // Live output can shrink the match list out from under the cursor; redo the
    // pass with a clamped index so the highlighted match always exists.
    if (first.matchCount > 0 && requestedIndex >= first.matchCount) {
      const clamped = first.matchCount - 1;
      return { ...highlightMatches(html, pattern, flags, clamped), currentIndex: clamped };
    }
    return { ...first, currentIndex: requestedIndex };
  }, [html, debouncedQuery, caseSensitive, useRegex, requestedIndex, regexError]);

  const goToNext = useCallback(() => {
    if (matchCount === 0) return;
    setSelection({ token: searchToken, index: (currentIndex + 1) % matchCount });
    onScrollToMatch?.();
  }, [matchCount, currentIndex, searchToken, onScrollToMatch]);

  const goToPrev = useCallback(() => {
    if (matchCount === 0) return;
    setSelection({ token: searchToken, index: (currentIndex - 1 + matchCount) % matchCount });
    onScrollToMatch?.();
  }, [matchCount, currentIndex, searchToken, onScrollToMatch]);

  // Scroll only when the *selection* moves. Tying this to matchCount made the
  // viewport jump on every incoming log line while a search was active.
  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (matchCount === 0 || !logRef.current) return;
    const key = `${debouncedQuery} ${currentIndex}`;
    if (lastScrolledRef.current === key) return;
    lastScrolledRef.current = key;

    const frame = requestAnimationFrame(() => {
      const el = logRef.current?.querySelector('.log-highlight-active');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, matchCount, debouncedQuery, logRef]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setSelection({ token: '', index: 0 });
    lastScrolledRef.current = null;
  }, []);

  const toggleCaseSensitive = useCallback(() => setCaseSensitive((v) => !v), []);
  const toggleRegex = useCallback(() => setUseRegex((v) => !v), []);

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
    regexError,
    highlightedHtml,
  };
}
