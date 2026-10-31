// Lets Node 24 (which strips TypeScript types itself) run the app's pure modules directly: an import without an
// extension ('./extract') resolves to the .ts file beside it, as the bundler does. Usage: import './_ts.mjs' first.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) {
      if ((spec.startsWith('.') || spec.startsWith('/')) && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
      throw e;
    }
  }
`));
