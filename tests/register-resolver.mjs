/**
 * Registers the test-only resolver hook, then runs the requested test files.
 * Used by `scripts/check.sh` so every suite shares one resolution setup.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolver.mjs", pathToFileURL(`${import.meta.dirname}/`));
