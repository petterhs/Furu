import test from "node:test";
import assert from "node:assert/strict";
import { firmwareLabel } from "../src/lib/firmwareLabel.ts";

test("firmware identity does not use the nickname or manually chosen profile", () => {
  assert.equal(firmwareLabel({name: "Kongle", nickname: "Daily driver", profilePreference: "infinitime"}, {firmwareRevision:"0.3.1"}), "Kongle v0.3.1");
  assert.equal(firmwareLabel({name:"InfiniTime", detectedProfileId:"kongle"}, {firmwareRevision:"v0.3.1"}), "Kongle v0.3.1");
  assert.equal(firmwareLabel({name:"Kongle", detectedProfileId:"kongle"}, {softwareRevision:"InfiniTime", firmwareRevision:"1.16.1"}), "InfiniTime v1.16.1");
  assert.equal(firmwareLabel({name:"Other watch"}, null), "Firmware");
});
