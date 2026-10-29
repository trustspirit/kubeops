import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guardOpenChange, preventWhileBusy } from './dialog-busy';

function fakeEvent() {
  let prevented = false;
  return {
    event: { preventDefault: () => { prevented = true; } },
    wasPrevented: () => prevented,
  };
}

describe('preventWhileBusy', () => {
  it('prevents dismissal while busy and still calls the wrapped handler', () => {
    const { event, wasPrevented } = fakeEvent();
    let called = false;
    preventWhileBusy(true, () => { called = true; })(event);
    assert.equal(wasPrevented(), true);
    assert.equal(called, true);
  });

  it('lets dismissal through when idle', () => {
    const { event, wasPrevented } = fakeEvent();
    preventWhileBusy(false)(event);
    assert.equal(wasPrevented(), false);
  });
});

describe('guardOpenChange', () => {
  it('drops close requests while busy', () => {
    const calls: boolean[] = [];
    guardOpenChange(true, (open) => calls.push(open))(false);
    assert.deepEqual(calls, []);
  });

  it('always lets open requests through', () => {
    const calls: boolean[] = [];
    guardOpenChange(true, (open) => calls.push(open))(true);
    assert.deepEqual(calls, [true]);
  });

  it('passes close requests through when idle', () => {
    const calls: boolean[] = [];
    guardOpenChange(false, (open) => calls.push(open))(false);
    assert.deepEqual(calls, [false]);
  });
});
