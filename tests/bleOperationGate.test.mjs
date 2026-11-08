import assert from "node:assert/strict";
import test from "node:test";
import { BleOperationGate } from "../src/lib/bleOperationGate.ts";

test("DFU cannot start while a profile write awaits native completion or publishes state", async () => {
  const gate = new BleOperationGate();
  let complete;
  const nativeWrite = new Promise((resolve) => { complete = resolve; });
  assert.equal(gate.beginCapabilities(), true);
  assert.equal(gate.beginDfu(), false);
  const write = (async () => {
    await nativeWrite;
    // Publishing features must still be inside the same critical section.
    assert.equal(gate.beginDfu(), false);
    gate.endCapabilities();
  })();
  complete();
  await write;
  assert.equal(gate.beginDfu(), true);
});

test("connection finalization may configure capabilities without releasing its mutation", () => {
  const gate = new BleOperationGate();
  assert.equal(gate.beginMutation(), true);
  assert.equal(gate.beginCapabilities(), false);
  assert.equal(gate.beginCapabilities(true), true);
  assert.equal(gate.beginDfu(), false);
  gate.endCapabilities();
  assert.equal(gate.beginDfu(), false);
  gate.endMutation();
  assert.equal(gate.beginDfu(), true);
});

test("DFU defers capability edits and releasing DFU allows their replay", () => {
  const gate = new BleOperationGate();
  assert.equal(gate.beginDfu(), true);
  assert.equal(gate.beginCapabilities(), false);
  assert.equal(gate.beginCapabilities(true), false);
  assert.equal(gate.beginMutation(), false);
  gate.endDfu();
  assert.equal(gate.beginCapabilities(), true);
  assert.equal(gate.beginCapabilities(), false);
  assert.equal(gate.beginMutation(), false);
  gate.endCapabilities();
  assert.equal(gate.beginMutation(), true);
});
