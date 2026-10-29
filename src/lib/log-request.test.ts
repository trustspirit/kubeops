import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLogStreamPath,
  LOG_GAP_MARKER,
  LogResumeFilter,
  normalizeLogTailLines,
  parseLogTimestampKey,
} from './log-request';

describe('normalizeLogTailLines', () => {
  it('preserves zero so reconnecting follow streams do not replay history', () => {
    assert.equal(normalizeLogTailLines('0'), 0);
  });

  it('defaults invalid values and bounds oversized requests', () => {
    assert.equal(normalizeLogTailLines(undefined), 100);
    assert.equal(normalizeLogTailLines('-1'), 100);
    assert.equal(normalizeLogTailLines('1.5'), 100);
    assert.equal(normalizeLogTailLines('not-a-number'), 100);
    assert.equal(normalizeLogTailLines('100000'), 10_000);
  });
});

describe('buildLogStreamPath', () => {
  it('encodes the target and always asks for timestamps', () => {
    const path = buildLogStreamPath({
      clusterId: 'arn:aws/eks', namespace: 'web', podName: 'api-0', container: 'app', tailLines: 500,
    });
    assert.equal(path, '/ws/logs/arn%3Aaws%2Feks/web/api-0?container=app&follow=true&timestamps=true&tailLines=500');
  });
});

describe('parseLogTimestampKey', () => {
  it('sorts timestamps whose trailing zeros were trimmed', () => {
    const a = parseLogTimestampKey('2024-01-01T00:00:00.1Z first\n')!;
    const b = parseLogTimestampKey('2024-01-01T00:00:00.12Z second\n')!;
    assert.ok(a < b);
  });

  it('returns null for lines without a timestamp', () => {
    assert.equal(parseLogTimestampKey('plain line\n'), null);
  });
});

describe('LogResumeFilter', () => {
  const line = (ts: string, text: string) => `2024-01-01T00:00:${ts}Z ${text}\n`;

  it('holds partial lines until their newline arrives', () => {
    const filter = new LogResumeFilter();
    assert.equal(filter.process('2024-01-01T00:00:01Z hel'), '');
    assert.equal(filter.process('lo\n'), '2024-01-01T00:00:01Z hello\n');
  });

  it('flushes a held partial line', () => {
    const filter = new LogResumeFilter();
    filter.process('no newline yet');
    assert.equal(filter.flush(), 'no newline yet');
    assert.equal(filter.flush(), '');
  });

  it('drops replayed lines that were already shown', () => {
    const filter = new LogResumeFilter();
    filter.process(line('01', 'a') + line('02', 'b'));
    filter.beginResume();
    const out = filter.process(line('01', 'a') + line('02', 'b') + line('03', 'c'));
    assert.equal(out, line('03', 'c'));
  });

  it('keeps a distinct line that shares the last timestamp', () => {
    const filter = new LogResumeFilter();
    filter.process(line('02', 'b'));
    filter.beginResume();
    const out = filter.process(line('02', 'b') + line('02', 'b2'));
    assert.equal(out, line('02', 'b2'));
  });

  it('marks a gap when the replay does not reach the last shown line', () => {
    const filter = new LogResumeFilter();
    filter.process(line('01', 'a'));
    filter.beginResume();
    const out = filter.process(line('05', 'e'));
    assert.equal(out, LOG_GAP_MARKER + line('05', 'e'));
  });

  it('does not resume after a reset', () => {
    const filter = new LogResumeFilter();
    filter.process(line('05', 'e'));
    filter.reset();
    filter.beginResume();
    assert.equal(filter.process(line('01', 'a')), line('01', 'a'));
  });
});
