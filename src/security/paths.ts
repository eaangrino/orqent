import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function nearestExistingParent(path: string): Promise<string> {
  let current = path;

  while (true) {
    try {
      await stat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

export async function resolveWithinRoot(
  rootDir: string,
  requestedPath: string,
): Promise<string> {
  const root = await realpath(rootDir);
  const candidate = resolve(root, requestedPath || ".");

  if (!isInside(root, candidate)) {
    throw new Error(`La ruta escapa del directorio permitido: ${requestedPath}`);
  }

  const existingParent = await nearestExistingParent(candidate);
  const realParent = await realpath(existingParent);

  if (!isInside(root, realParent)) {
    throw new Error(`La ruta resuelve fuera del directorio permitido: ${requestedPath}`);
  }

  return candidate;
}
