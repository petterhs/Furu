import test from "node:test";
import assert from "node:assert/strict";
import { mergeNativeEvents } from "../src/lib/connectionEventMerge.ts";
const event = (id, time, connected) => ({ deviceId:"watch", nativeId:id, at:`2026-11-08T10:00:${time}Z`, connected, detail:"native" });
test("replay after WebView reload does not duplicate events", () => {
  const events = [event(1,"00.000",true), event(2,"00.100",false), event(3,"00.200",true)];
  const history = mergeNativeEvents({},events);
  assert.equal(history.watch.length,3);
  assert.equal(mergeNativeEvents(history,events),history);
});
test("delayed events are inserted at their original time and preserve other devices", () => {
  const initial = mergeNativeEvents({other:[{at:"2026-11-08T00:00:00Z",connected:true}]},[event(3,"03.000",true)]);
  const next = mergeNativeEvents(initial,[event(1,"01.000",true), event(2,"02.000",false)]);
  assert.deepEqual(next.watch.map(e=>e.nativeId),[1,2,3]);
  assert.equal(initial.watch.length,1); assert.equal(next.other,initial.other);
});
