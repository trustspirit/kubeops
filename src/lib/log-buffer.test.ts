import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogBuffer } from './log-buffer';

/** Stand-in for ansi-to-html: wraps each converted chunk so calls are countable. */
function makeConverter() {
  const calls: string[] = [];
  return {
    calls,
    convert: (raw: string) => {
      calls.push(raw);
      return `<s>${raw}</s>`;
    },
  };
}

describe('LogBuffer', () => {
  it('converts each chunk exactly once instead of re-converting the buffer', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 1000, convert: converter.convert });

    buffer.append('one\n');
    buffer.append('two\n');
    buffer.append('three\n');

    assert.deepEqual(converter.calls, ['one\n', 'two\n', 'three\n']);
    assert.equal(buffer.text, 'one\ntwo\nthree\n');
  });

  it('holds back a partial line so ANSI sequences are never split', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 1000, convert: converter.convert });

    buffer.append('complete\npar');
    assert.deepEqual(converter.calls, ['complete\n']);
    assert.equal(buffer.text, 'complete\n');

    buffer.append('tial\n');
    assert.deepEqual(converter.calls, ['complete\n', 'partial\n']);
    assert.equal(buffer.text, 'complete\npartial\n');
  });

  it('flushes an unterminated trailing line on demand', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 1000, convert: converter.convert });

    buffer.append('no newline yet');
    assert.equal(buffer.text, '');

    buffer.flushPending();
    assert.equal(buffer.text, 'no newline yet');
  });

  it('drops the oldest segments once the cap is exceeded and reports truncation', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 12, convert: converter.convert });

    buffer.append('aaaaa\n'); // 6 chars
    buffer.append('bbbbb\n'); // 12 total
    assert.equal(buffer.truncated, false);

    buffer.append('ccccc\n'); // 18 total → first segment dropped
    assert.equal(buffer.truncated, true);
    assert.equal(buffer.text, 'bbbbb\nccccc\n');
  });

  it('keeps html and text consistent after trimming', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 12, convert: converter.convert });

    buffer.append('aaaaa\n');
    buffer.append('bbbbb\n');
    buffer.append('ccccc\n');

    assert.equal(buffer.html, '<s>bbbbb\n</s><s>ccccc\n</s>');
  });

  it('never trims below a single segment', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 2, convert: converter.convert });

    buffer.append('a very long single line\n');
    assert.equal(buffer.text, 'a very long single line\n');
  });

  it('clear resets every derived value', () => {
    const converter = makeConverter();
    const buffer = new LogBuffer({ maxChars: 4, convert: converter.convert });

    buffer.append('aaa\n');
    buffer.append('bbb\n');
    buffer.clear();

    assert.equal(buffer.text, '');
    assert.equal(buffer.html, '');
    assert.equal(buffer.length, 0);
    assert.equal(buffer.truncated, false);
  });
});
