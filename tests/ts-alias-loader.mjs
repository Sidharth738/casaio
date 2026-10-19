import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = resolvePath(process.cwd(), 'src', `${specifier.slice(2)}.ts`);
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
