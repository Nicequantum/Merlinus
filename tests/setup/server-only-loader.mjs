/**
 * Integration tests import Next.js route handlers directly in Node.
 * Stub `server-only` so route dependency graphs load outside the Next bundler.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'data:text/javascript,export default undefined',
    };
  }

  return nextResolve(specifier, context);
}