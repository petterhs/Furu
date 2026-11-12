/**
 * Test-only module resolver.
 *
 * The app is bundled by Vite, which resolves extensionless TypeScript imports
 * and the `$lib` alias. `node --test` does neither, so the unit tests register
 * this hook to reuse the real modules instead of copying their logic.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const LIB_ROOT = resolvePath(import.meta.dirname, "..", "src", "lib");

/** Maps `#lib/...` onto the source tree. */
function fromAlias(specifier) {
  if (!specifier.startsWith("#lib/")) return null;
  return resolvePath(LIB_ROOT, specifier.slice("#lib/".length));
}

/** Returns the first existing candidate with a TypeScript/JavaScript suffix. */
function withExtensions(basePath) {
  for (const suffix of [".ts", ".svelte.ts", ".js", "/index.ts"]) {
    const candidate = basePath + suffix;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const alias = fromAlias(specifier);
  if (alias) {
    const file = withExtensions(alias);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }

  if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
    const base = resolvePath(dirname(context.parentURL ? new URL(context.parentURL).pathname : process.cwd()), specifier);
    const file = withExtensions(base);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }

  return nextResolve(specifier, context);
}
