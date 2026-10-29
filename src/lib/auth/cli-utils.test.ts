import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CliTimeoutError, extractCliError, findUnsafeCliValue, formatTimeout, runCli } from './cli-utils';

describe('formatTimeout', () => {
  it('formats whole minutes and seconds', () => {
    assert.equal(formatTimeout(120_000), '2 minutes');
    assert.equal(formatTimeout(60_000), '1 minute');
    assert.equal(formatTimeout(300_000), '5 minutes');
    assert.equal(formatTimeout(30_000), '30 seconds');
    assert.equal(formatTimeout(1_000), '1 second');
    assert.equal(formatTimeout(90_000), '90 seconds');
  });
});

describe('runCli', () => {
  it('resolves stdout without blocking the event loop', async () => {
    let ticked = false;
    const timer = setImmediate(() => { ticked = true; });
    const out = await runCli(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("ok"), 50)']);
    clearImmediate(timer);
    assert.equal(out, 'ok');
    assert.equal(ticked, true);
  });

  it('attaches stderr to failures so extractCliError can surface it', async () => {
    const err = await runCli(process.execPath, ['-e', 'process.stderr.write("bad thing"); process.exit(3)'])
      .then(() => null, (e: unknown) => e);
    assert.ok(err);
    assert.equal(extractCliError(err, 'fallback'), 'bad thing');
  });

  it('maps a timeout to a readable message', async () => {
    const err = await runCli(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], 100, { label: 'Login' })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof CliTimeoutError);
    assert.equal(extractCliError(err, 'fallback'), 'Login timed out after 1 second');
  });

  it('closes stdin so a prompting CLI fails fast', async () => {
    const out = await runCli(process.execPath, ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("eof"))'], 5_000);
    assert.equal(out, 'eof');
  });
});

describe('findUnsafeCliValue', () => {
  it('flags option-looking and control-character values, skipping empties', () => {
    assert.equal(findUnsafeCliValue({ cluster: 'prod-eks', region: undefined, project: '' }), null);
    assert.equal(findUnsafeCliValue({ cluster: 'ok', clusterName: '--impersonate=admin' }), 'clusterName');
    assert.equal(findUnsafeCliValue({ cluster: 'a\nb' }), 'cluster');
  });
});
