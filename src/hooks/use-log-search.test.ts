import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { highlightMatches } from './use-log-search';

describe('highlightMatches', () => {
  it('counts exactly what it marks up', () => {
    const { html, matchCount } = highlightMatches('error here and error there', 'error', 'gi', 0);
    assert.equal(matchCount, 2);
    assert.equal((html.match(/<mark/g) || []).length, 2);
  });

  it('counts escaped entities the way the rendered HTML has them', () => {
    // The viewer escapes log text, so a literal "<" is "&lt;" by the time it is
    // searched. Counting against the raw log instead used to disagree.
    const { matchCount } = highlightMatches('a &lt;b&gt; c', '&lt;', 'g', 0);
    assert.equal(matchCount, 1);
  });

  it('never inserts markup inside a tag', () => {
    const { html, matchCount } = highlightMatches(
      '<span style="color:#fff">span</span>',
      'span',
      'g',
      0,
    );
    assert.equal(matchCount, 1);
    assert.ok(html.startsWith('<span style="color:#fff">'));
    assert.ok(html.includes('<mark class="log-highlight log-highlight-active" data-match-index="0">span</mark>'));
  });

  it('marks the active match distinctly', () => {
    const { html } = highlightMatches('x x x', 'x', 'g', 1);
    const active = html.match(/data-match-index="(\d+)"/g) || [];
    assert.equal(active.length, 3);
    assert.ok(html.includes('log-highlight-active" data-match-index="1"'));
  });

  it('returns the input unchanged for an invalid pattern', () => {
    const input = 'nothing to see';
    const { html, matchCount } = highlightMatches(input, '(', 'g', 0);
    assert.equal(html, input);
    assert.equal(matchCount, 0);
  });

  it('does not loop forever on a zero-width match', () => {
    const { matchCount } = highlightMatches('abc', 'x*', 'g', 0);
    assert.equal(matchCount, 0);
  });
});
