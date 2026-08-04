import {
  mkdir,
  opendir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { resolveWithinRoot } from "../../security/paths.js";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../types.js";
import { truncateUtf8 } from "../output.js";
import {
  asRecord,
  nullableInteger,
  nullableString,
  requiredBoolean,
  requiredString,
} from "../validation.js";

type FsReadArgs = {
  path: string;
  start_line: number | null;
  end_line: number | null;
};

type FsListArgs = {
  path: string;
  depth: number | null;
  include_hidden: boolean;
};

type FsWriteArgs = {
  path: string;
  content: string;
  overwrite: boolean;
};

type FsReplaceArgs = {
  path: string;
  old_text: string;
  new_text: string;
  replace_all: boolean;
};

type FsSearchArgs = {
  query: string;
  path: string;
  glob: string | null;
  max_results: number | null;
};

function lineSlice(
  content: string,
  startLine: number | null,
  endLine: number | null,
): { content: string; start: number; end: number; total: number } {
  const lines = content.split("\n");
  const total = lines.length;
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(total, endLine ?? total);
  return {
    content: start > end ? "" : lines.slice(start - 1, end).join("\n"),
    start,
    end,
    total,
  };
}

async function listFiles(
  root: string,
  directory: string,
  maxDepth: number,
  includeHidden: boolean,
): Promise<Array<{ path: string; type: "file" | "directory"; size?: number }>> {
  const output: Array<{
    path: string;
    type: "file" | "directory";
    size?: number;
  }> = [];

  async function walk(current: string, depth: number): Promise<void> {
    const dir = await opendir(current);
    for await (const entry of dir) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      const fullPath = join(current, entry.name);
      const displayPath = (relative(root, fullPath) || ".").split(sep).join("/");
      if (entry.isDirectory()) {
        output.push({ path: displayPath, type: "directory" });
        if (depth < maxDepth) await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        output.push({ path: displayPath, type: "file", size: info.size });
      }
    }
  }

  await walk(directory, 0);
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function wildcardToRegExp(pattern: string): RegExp {
  const normalized = pattern.replaceAll("\\", "/");
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    const next = normalized[index + 1] ?? "";

    if (character === "*" && next === "*") {
      const after = normalized[index + 2] ?? "";
      source += after === "/" ? "(?:.*/)?" : ".*";
      index += after === "/" ? 2 : 1;
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  return new RegExp(`^${source}$`);
}

export const fsReadTool: ToolDefinition<FsReadArgs> = {
  name: "fs_read",
  description:
    "Lee un archivo de texto del workspace. Puede limitar la lectura a un rango de líneas.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Ruta relativa al workspace." },
      start_line: {
        type: ["integer", "null"],
        minimum: 1,
        description: "Primera línea, basada en 1, o null.",
      },
      end_line: {
        type: ["integer", "null"],
        minimum: 1,
        description: "Última línea inclusiva, o null.",
      },
    },
    required: ["path", "start_line", "end_line"],
    additionalProperties: false,
  },
  parse(value): FsReadArgs {
    const record = asRecord(value);
    return {
      path: requiredString(record, "path"),
      start_line: nullableInteger(record, "start_line", 1),
      end_line: nullableInteger(record, "end_line", 1),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const path = await resolveWithinRoot(context.rootDir, args.path);
    const content = await readFile(path, "utf8");
    const selected = lineSlice(content, args.start_line, args.end_line);
    const limited = truncateUtf8(selected.content, context.maxOutputBytes);
    return {
      ok: true,
      data: {
        path: relative(context.rootDir, path),
        content: limited.text,
        start_line: selected.start,
        end_line: selected.end,
        total_lines: selected.total,
      },
      metadata: {
        truncated: limited.truncated,
        original_bytes: limited.originalBytes,
      },
    };
  },
};

export const fsListTool: ToolDefinition<FsListArgs> = {
  name: "fs_list",
  description:
    "Lista archivos y directorios dentro del workspace con profundidad controlada.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directorio relativo al workspace." },
      depth: {
        type: ["integer", "null"],
        minimum: 0,
        maximum: 8,
        description: "Profundidad máxima, o null para 2.",
      },
      include_hidden: {
        type: "boolean",
        description: "Incluye entradas cuyo nombre comienza por punto.",
      },
    },
    required: ["path", "depth", "include_hidden"],
    additionalProperties: false,
  },
  parse(value): FsListArgs {
    const record = asRecord(value);
    return {
      path: requiredString(record, "path"),
      depth: nullableInteger(record, "depth", 0, 8),
      include_hidden: requiredBoolean(record, "include_hidden"),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const directory = await resolveWithinRoot(context.rootDir, args.path);
    const files = await listFiles(
      context.rootDir,
      directory,
      args.depth ?? 2,
      args.include_hidden,
    );
    const serialized = JSON.stringify(files);
    const limited = truncateUtf8(serialized, context.maxOutputBytes);
    if (limited.truncated) {
      return {
        ok: true,
        data: {
          path: relative(context.rootDir, directory) || ".",
          entries: files.slice(0, 500),
          warning: "La lista fue recortada.",
        },
        metadata: { truncated: true, original_bytes: limited.originalBytes },
      };
    }
    return {
      ok: true,
      data: { path: relative(context.rootDir, directory) || ".", entries: files },
    };
  },
};

export const fsWriteTool: ToolDefinition<FsWriteArgs> = {
  name: "fs_write",
  description:
    "Crea o sobrescribe un archivo de texto dentro del workspace. Requiere confirmación salvo en modo auto.",
  risk: "write",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Ruta relativa al workspace." },
      content: { type: "string", description: "Contenido completo del archivo." },
      overwrite: {
        type: "boolean",
        description: "Debe ser true para reemplazar un archivo existente.",
      },
    },
    required: ["path", "content", "overwrite"],
    additionalProperties: false,
  },
  parse(value): FsWriteArgs {
    const record = asRecord(value);
    return {
      path: requiredString(record, "path"),
      content: typeof record.content === "string" ? record.content : (() => {
        throw new Error("El campo content debe ser string.");
      })(),
      overwrite: requiredBoolean(record, "overwrite"),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const path = await resolveWithinRoot(context.rootDir, args.path);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, args.content, {
        encoding: "utf8",
        flag: args.overwrite ? "w" : "wx",
      });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "write_failed";
      if (code === "EEXIST") {
        return toolError(
          "file_exists",
          "El archivo ya existe. Use overwrite=true solo si realmente debe reemplazarlo.",
        );
      }
      throw error;
    }
    return {
      ok: true,
      data: {
        path: relative(context.rootDir, path),
        bytes_written: Buffer.byteLength(args.content, "utf8"),
      },
    };
  },
};

export const fsReplaceTool: ToolDefinition<FsReplaceArgs> = {
  name: "fs_replace",
  description:
    "Reemplaza texto exacto dentro de un archivo. Falla si el texto no existe o si es ambiguo y replace_all es false.",
  risk: "write",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Ruta relativa al workspace." },
      old_text: { type: "string", description: "Texto exacto que debe existir." },
      new_text: { type: "string", description: "Texto sustituto." },
      replace_all: {
        type: "boolean",
        description: "Reemplaza todas las apariciones cuando es true.",
      },
    },
    required: ["path", "old_text", "new_text", "replace_all"],
    additionalProperties: false,
  },
  parse(value): FsReplaceArgs {
    const record = asRecord(value);
    const newText = record.new_text;
    if (typeof newText !== "string") {
      throw new Error("El campo new_text debe ser string.");
    }
    return {
      path: requiredString(record, "path"),
      old_text: requiredString(record, "old_text"),
      new_text: newText,
      replace_all: requiredBoolean(record, "replace_all"),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const path = await resolveWithinRoot(context.rootDir, args.path);
    const content = await readFile(path, "utf8");
    const occurrences = content.split(args.old_text).length - 1;
    if (occurrences === 0) {
      return toolError("text_not_found", "El texto exacto no existe en el archivo.");
    }
    if (occurrences > 1 && !args.replace_all) {
      return toolError(
        "ambiguous_replacement",
        `El texto aparece ${occurrences} veces. Use replace_all=true o amplíe old_text.`,
      );
    }
    const next = args.replace_all
      ? content.split(args.old_text).join(args.new_text)
      : content.replace(args.old_text, args.new_text);
    await writeFile(path, next, "utf8");
    return {
      ok: true,
      data: {
        path: relative(context.rootDir, path),
        replacements: args.replace_all ? occurrences : 1,
      },
    };
  },
};

export const fsSearchTool: ToolDefinition<FsSearchArgs> = {
  name: "fs_search",
  description:
    "Busca texto literal en archivos de texto del workspace y devuelve coincidencias con número de línea.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto literal a buscar." },
      path: { type: "string", description: "Directorio relativo donde buscar." },
      glob: {
        type: ["string", "null"],
        description: "Patrón simple, por ejemplo **/*.ts, o null.",
      },
      max_results: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 500,
        description: "Máximo de resultados, o null para 100.",
      },
    },
    required: ["query", "path", "glob", "max_results"],
    additionalProperties: false,
  },
  parse(value): FsSearchArgs {
    const record = asRecord(value);
    return {
      query: requiredString(record, "query"),
      path: requiredString(record, "path"),
      glob: nullableString(record, "glob"),
      max_results: nullableInteger(record, "max_results", 1, 500),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const directory = await resolveWithinRoot(context.rootDir, args.path);
    const entries = await listFiles(context.rootDir, directory, 20, false);
    const matcher = args.glob ? wildcardToRegExp(args.glob) : null;
    const maxResults = args.max_results ?? 100;
    const matches: Array<{ path: string; line: number; text: string }> = [];

    for (const entry of entries) {
      if (entry.type !== "file") continue;
      if (matcher && !matcher.test(entry.path)) continue;
      const fullPath = await resolveWithinRoot(context.rootDir, entry.path);
      let content: string;
      try {
        content = await readFile(fullPath, "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (!line.includes(args.query)) continue;
        matches.push({ path: entry.path, line: index + 1, text: line.slice(0, 500) });
        if (matches.length >= maxResults) {
          return {
            ok: true,
            data: { matches, limit_reached: true },
          };
        }
      }
    }

    return { ok: true, data: { matches, limit_reached: false } };
  },
};
