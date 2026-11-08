import assert from "node:assert/strict";
import test from "node:test";
import { ReconnectCycle } from "../src/lib/reconnect.ts";

function fixture(overrides = {}) {
  const jobs = [], attempts = [], messages = [];
  let stopped = 0;
  const cycle = new ReconnectCycle({
    settings: () => ({ enabled: true, retryDelayMs: 60_000, maxFailures: 0 }),
    state: () => "ready",
    connect: async (address, direct) => { attempts.push({ address, direct }); return false; },
    log: (message) => messages.push(message),
    stopped: () => stopped++,
    schedule: (callback, delay) => {
      const job = { callback, delay, cancelled: false };
      jobs.push(job);
      return () => { job.cancelled = true; };
    },
    ...overrides,
  });
  return { cycle, jobs, attempts, messages, stopped: () => stopped,
    tick: async () => {
      const job = jobs.shift();
      assert.ok(job);
      if (!job.cancelled) await job.callback();
    },
  };
}

test("first reconnect is prompt, uses only MAC, then alternates scan fallback", async () => {
  const f = fixture();
  assert.equal(f.cycle.start("AA:BB:CC:DD:EE:FF"), true);
  assert.equal(f.jobs[0].delay, 5_000);
  await f.tick();
  assert.deepEqual(f.attempts[0], { address: "AA:BB:CC:DD:EE:FF", direct: true });
  assert.equal(f.jobs[0].delay, 60_000);
  await f.tick();
  assert.equal(f.attempts[1].direct, false);
});

test("manual cancellation during an attempt cannot restart the retry loop", async () => {
  let finish;
  const f = fixture({ connect: () => new Promise((resolve) => { finish = resolve; }) });
  f.cycle.start("watch");
  const pending = f.tick();
  f.cycle.cancel();
  finish(false);
  await pending;
  assert.equal(f.jobs.length, 0);
});

test("a late result from an old cycle cannot reschedule over a new target", async () => {
  let finish;
  const f = fixture({ connect: () => new Promise((resolve) => { finish = resolve; }) });
  f.cycle.start("old-watch");
  const pending = f.tick();
  f.cycle.start("new-watch");
  finish(false);
  await pending;
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].delay, 5_000);
});

test("busy work does not consume failures; max failures stop immediately", async () => {
  let busy = true;
  const f = fixture({ state: () => busy ? "busy" : "ready",
    settings: () => ({ enabled: true, retryDelayMs: 60_000, maxFailures: 1 }) });
  f.cycle.start("watch");
  await f.tick();
  assert.equal(f.attempts.length, 0);
  busy = false;
  await f.tick();
  assert.equal(f.attempts.length, 1);
  assert.equal(f.jobs.length, 0);
  assert.equal(f.stopped(), 1);
});

test("success stops retrying without stopping the connected keepalive service", async () => {
  const f = fixture({ connect: async () => true });
  f.cycle.start("watch");
  await f.tick();
  assert.equal(f.jobs.length, 0);
  assert.equal(f.stopped(), 0);
});

test("disabled or forgotten device stops; cancelled timers cannot connect", async () => {
  let enabled = true;
  const f = fixture({ settings: () => ({ enabled, retryDelayMs: 60_000, maxFailures: 0 }) });
  f.cycle.start("watch");
  enabled = false;
  await f.tick();
  assert.equal(f.attempts.length, 0);
  assert.equal(f.stopped(), 1);
  assert.equal(f.cycle.start("watch"), false);
  enabled = true;
  f.cycle.start("watch");
  f.cycle.cancel();
  await f.tick();
  assert.equal(f.attempts.length, 0);
});
