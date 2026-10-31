// Lets the Node unit checks import the app's TypeScript as written: extensionless relative imports ("./capture/extract")
// and "@/…" resolve to the .ts file. Node 24 strips the types. Import this first, then import the sources dynamically.
// It also writes the feature registry's files (scripts/features.mjs), which lib/features.ts reads.
import { registerHooks } from 'node:module';
import { generate } from '../scripts/features.mjs';

generate();

const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      const base = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec.startsWith('.') ? spec : null;
      if (!base) throw e;
      for (const ext of ['.ts', '.tsx', '/index.ts']) { try { return next(base + ext, ctx); } catch { /* next */ } }
      throw e;
    }
  },
});
