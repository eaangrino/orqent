import {
  executeCliCommand,
  type CliCommandAdapterInput,
  type CliCommandAdapterResult,
} from "../../extensibility/adapters/index.js";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type DockerPsInput = {
  all: boolean;
  includeSize: boolean;
  maxContainers: number;
};

export type DockerContainerSummary = {
  id: string | null;
  image: string | null;
  command: string | null;
  createdAt: string | null;
  runningFor: string | null;
  ports: string | null;
  names: string | null;
  state: string | null;
  status: string | null;
  size: string | null;
  labels: string | null;
  localVolumes: string | null;
  networks: string | null;
  raw: Record<string, unknown>;
};

export type DockerPsResult = {
  cwd: string;
  all: boolean;
  includeSize: boolean;
  maxContainers: number;
  count: number;
  containers: DockerContainerSummary[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerInspectType =
  | "auto"
  | "container"
  | "image"
  | "volume"
  | "network";

export type DockerInspectInput = {
  target: string;
  type: DockerInspectType;
};

export type DockerInspectResult = {
  cwd: string;
  target: string;
  type: DockerInspectType;
  count: number;
  items: unknown[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerLogsInput = {
  target: string;
  tail: number;
  since: string | null;
  timestamps: boolean;
};

export type DockerLogsResult = {
  cwd: string;
  target: string;
  tail: number;
  since: string | null;
  timestamps: boolean;
  stdout: string;
  stderr: string;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerComposePsInput = {
  all: boolean;
  services: string[];
  maxServices: number;
};

export type DockerComposeServiceSummary = {
  id: string | null;
  name: string | null;
  command: string | null;
  project: string | null;
  service: string | null;
  state: string | null;
  health: string | null;
  exitCode: number | null;
  publishers: unknown[];
  raw: Record<string, unknown>;
};

export type DockerComposePsResult = {
  cwd: string;
  all: boolean;
  services: string[];
  maxServices: number;
  count: number;
  servicesFound: DockerComposeServiceSummary[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerImagesInput = {
  all: boolean;
  dangling: boolean;
  maxImages: number;
};

export type DockerImageSummary = {
  id: string | null;
  repository: string | null;
  tag: string | null;
  digest: string | null;
  createdAt: string | null;
  createdSince: string | null;
  size: string | null;
  sharedSize: string | null;
  uniqueSize: string | null;
  virtualSize: string | null;
  containers: string | null;
  raw: Record<string, unknown>;
};

export type DockerImagesResult = {
  cwd: string;
  all: boolean;
  dangling: boolean;
  maxImages: number;
  count: number;
  images: DockerImageSummary[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerNetworksInput = {
  maxNetworks: number;
};

export type DockerNetworkSummary = {
  id: string | null;
  name: string | null;
  driver: string | null;
  scope: string | null;
  ipv6: string | null;
  internal: string | null;
  labels: string | null;
  raw: Record<string, unknown>;
};

export type DockerVolumesInput = {
  dangling: boolean;
  maxVolumes: number;
};

export type DockerVolumeSummary = {
  name: string | null;
  driver: string | null;
  scope: string | null;
  mountpoint: string | null;
  labels: string | null;
  links: string | null;
  size: string | null;
  raw: Record<string, unknown>;
};

export type DockerVolumesResult = {
  cwd: string;
  dangling: boolean;
  maxVolumes: number;
  count: number;
  volumes: DockerVolumeSummary[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type DockerNetworksResult = {
  cwd: string;
  maxNetworks: number;
  count: number;
  networks: DockerNetworkSummary[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type CliCommandRunner = (
  input: CliCommandAdapterInput,
) => Promise<CliCommandAdapterResult>;

const DEFAULT_MAX_CONTAINERS = 50;
const MAX_CONTAINERS_LIMIT = 200;
const DOCKER_PS_TIMEOUT_MS = 10_000;
const DOCKER_PS_MAX_OUTPUT_CHARS = 64_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.round(value)));
}

function getStringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[ key ];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateDockerPsInput(
  input: unknown,
): ToolValidationResult<DockerPsInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      all: normalizeBoolean(input.all, false),
      includeSize: normalizeBoolean(input.includeSize, false),
      maxContainers: normalizePositiveInteger(
        input.maxContainers,
        DEFAULT_MAX_CONTAINERS,
        MAX_CONTAINERS_LIMIT,
      ),
    },
  };
}

function buildDockerPsArgs(input: DockerPsInput): string[] {
  const args = [
    "ps",
    "--no-trunc",
    "--format",
    "{{json .}}",
  ];

  if (input.all) {
    args.splice(1, 0, "--all");
  }

  if (input.includeSize) {
    args.splice(1, 0, "--size");
  }

  return args;
}

function parseDockerPsOutput(stdout: string): DockerContainerSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;

        if (!isRecord(parsed)) {
          return [];
        }

        return [
          {
            id: getStringField(parsed, "ID"),
            image: getStringField(parsed, "Image"),
            command: getStringField(parsed, "Command"),
            createdAt: getStringField(parsed, "CreatedAt"),
            runningFor: getStringField(parsed, "RunningFor"),
            ports: getStringField(parsed, "Ports"),
            names: getStringField(parsed, "Names"),
            state: getStringField(parsed, "State"),
            status: getStringField(parsed, "Status"),
            size: getStringField(parsed, "Size"),
            labels: getStringField(parsed, "Labels"),
            localVolumes: getStringField(parsed, "LocalVolumes"),
            networks: getStringField(parsed, "Networks"),
            raw: parsed,
          },
        ];
      } catch {
        return [];
      }
    });
}

function createDockerPsError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerPsResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_ps_timed_out",
        message: "docker ps timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_ps_failed",
      message:
        result.stderr.trim() ||
        `docker ps failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function normalizeDockerInspectType(value: unknown): DockerInspectType {
  if (
    value === "container" ||
    value === "image" ||
    value === "volume" ||
    value === "network"
  ) {
    return value;
  }

  return "auto";
}

function validateDockerInspectInput(
  input: unknown,
): ToolValidationResult<DockerInspectInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const target = typeof input.target === "string" ? input.target.trim() : "";

  if (!target) {
    return {
      ok: false,
      error: "target must be a non-empty string.",
    };
  }

  if (/[\r\n]/.test(target)) {
    return {
      ok: false,
      error: "target cannot contain line breaks.",
    };
  }

  return {
    ok: true,
    input: {
      target,
      type: normalizeDockerInspectType(input.type),
    },
  };
}

function buildDockerInspectArgs(input: DockerInspectInput): string[] {
  const args = [ "inspect" ];

  if (input.type !== "auto") {
    args.push("--type", input.type);
  }

  args.push(input.target);

  return args;
}

function parseDockerInspectOutput(stdout: string): unknown[] {
  const parsed = JSON.parse(stdout) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed;
}

function createDockerInspectError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerInspectResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_inspect_timed_out",
        message: "docker inspect timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_inspect_failed",
      message:
        result.stderr.trim() ||
        `docker inspect failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerInspectTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerInspectInput, DockerInspectResult> {
  return {
    name: "docker.inspect",
    description:
      "Inspect a Docker container, image, volume, or network using docker inspect through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Docker object name or id to inspect. Must not contain line breaks.",
        },
        type: {
          type: "string",
          enum: [ "auto", "container", "image", "volume", "network" ],
          description:
            "Optional Docker object type. Use auto when the type is unknown.",
        },
      },
      required: [ "target" ],
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerInspectInput,
    async execute(input, context) {
      const args = buildDockerInspectArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerInspectError(result);
      }

      try {
        const items = parseDockerInspectOutput(result.stdout);

        return {
          ok: true,
          result: {
            cwd: context.cwd,
            target: input.target,
            type: input.type,
            count: items.length,
            items,
            command: {
              command: "docker",
              args,
            },
            durationMs: result.durationMs,
            outputTruncated: result.truncated,
          },
          metadata: {
            adapter: "cli",
            command: "docker",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            truncated: result.truncated,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "docker_inspect_invalid_json",
            message:
              error instanceof Error
                ? `docker inspect returned invalid JSON: ${error.message}`
                : "docker inspect returned invalid JSON.",
            details: result,
          },
          metadata: {
            adapter: "cli",
            command: "docker",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            truncated: result.truncated,
          },
        };
      }
    },
  };
}

function validateDockerTarget(value: unknown): string | null {
  const target = typeof value === "string" ? value.trim() : "";

  if (!target) {
    return null;
  }

  if (/[\r\n]/.test(target)) {
    return null;
  }

  return target;
}

function normalizeDockerTail(value: unknown): number {
  return normalizePositiveInteger(value, 100, 10_000);
}

function normalizeDockerSince(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const since = value.trim();

  if (/[\r\n]/.test(since)) {
    return null;
  }

  return since;
}

function validateDockerLogsInput(
  input: unknown,
): ToolValidationResult<DockerLogsInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const target = validateDockerTarget(input.target);

  if (!target) {
    return {
      ok: false,
      error: "target must be a non-empty string without line breaks.",
    };
  }

  return {
    ok: true,
    input: {
      target,
      tail: normalizeDockerTail(input.tail),
      since: normalizeDockerSince(input.since),
      timestamps: normalizeBoolean(input.timestamps, false),
    },
  };
}

function buildDockerLogsArgs(input: DockerLogsInput): string[] {
  const args = [
    "logs",
    "--tail",
    String(input.tail),
  ];

  if (input.timestamps) {
    args.push("--timestamps");
  }

  if (input.since) {
    args.push("--since", input.since);
  }

  args.push(input.target);

  return args;
}

function createDockerLogsError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerLogsResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_logs_timed_out",
        message: "docker logs timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_logs_failed",
      message:
        result.stderr.trim() ||
        `docker logs failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerLogsTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerLogsInput, DockerLogsResult> {
  return {
    name: "docker.logs",
    description:
      "Read Docker container logs using docker logs through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Docker container name or id. Must not contain line breaks.",
        },
        tail: {
          type: "number",
          description:
            "Maximum number of log lines to return. Defaults to 100 and is capped at 10000.",
        },
        since: {
          type: "string",
          description:
            "Optional Docker --since value, for example 10m, 1h, or an RFC3339 timestamp.",
        },
        timestamps: {
          type: "boolean",
          description:
            "When true, include Docker log timestamps.",
        },
      },
      required: [ "target" ],
      additionalProperties: false,
    },
    risk: "medium",
    permissions: [ "shell:execute" ],
    requiresConfirmation: true,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerLogsInput,
    async execute(input, context) {
      const args = buildDockerLogsArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerLogsError(result);
      }

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          target: input.target,
          tail: input.tail,
          since: input.since,
          timestamps: input.timestamps,
          stdout: result.stdout,
          stderr: result.stderr,
          command: {
            command: "docker",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "docker",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function normalizeDockerComposeServices(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !/[\r\n]/.test(item)),
    ),
  );
}

function normalizeDockerComposeMaxServices(value: unknown): number {
  return normalizePositiveInteger(value, 50, 200);
}

function validateDockerComposePsInput(
  input: unknown,
): ToolValidationResult<DockerComposePsInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      all: normalizeBoolean(input.all, false),
      services: normalizeDockerComposeServices(input.services),
      maxServices: normalizeDockerComposeMaxServices(input.maxServices),
    },
  };
}

function buildDockerComposePsArgs(input: DockerComposePsInput): string[] {
  const args = [
    "compose",
    "ps",
    "--format",
    "json",
  ];

  if (input.all) {
    args.push("--all");
  }

  args.push(...input.services);

  return args;
}

function parseDockerComposePsOutput(
  stdout: string,
): DockerComposeServiceSummary[] {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }

  const items = Array.isArray(parsed) ? parsed : [ parsed ];

  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        id: getStringField(item, "ID"),
        name: getStringField(item, "Name"),
        command: getStringField(item, "Command"),
        project: getStringField(item, "Project"),
        service: getStringField(item, "Service"),
        state: getStringField(item, "State"),
        health: getStringField(item, "Health"),
        exitCode:
          typeof item.ExitCode === "number" && Number.isFinite(item.ExitCode)
            ? item.ExitCode
            : null,
        publishers: Array.isArray(item.Publishers) ? item.Publishers : [],
        raw: item,
      },
    ];
  });
}

function createDockerComposePsError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerComposePsResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_compose_ps_timed_out",
        message: "docker compose ps timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_compose_ps_failed",
      message:
        result.stderr.trim() ||
        `docker compose ps failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerComposePsTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerComposePsInput, DockerComposePsResult> {
  return {
    name: "docker.compose_ps",
    description:
      "List Docker Compose services using docker compose ps through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description:
            "When true, include stopped Docker Compose services using --all.",
        },
        services: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Optional Docker Compose service names to filter. Values with line breaks are ignored.",
        },
        maxServices: {
          type: "number",
          description:
            "Maximum number of Compose services to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerComposePsInput,
    async execute(input, context) {
      const args = buildDockerComposePsArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerComposePsError(result);
      }

      try {
        const servicesFound = parseDockerComposePsOutput(result.stdout).slice(
          0,
          input.maxServices,
        );

        return {
          ok: true,
          result: {
            cwd: context.cwd,
            all: input.all,
            services: input.services,
            maxServices: input.maxServices,
            count: servicesFound.length,
            servicesFound,
            command: {
              command: "docker",
              args,
            },
            durationMs: result.durationMs,
            outputTruncated: result.truncated,
          },
          metadata: {
            adapter: "cli",
            command: "docker",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            truncated: result.truncated,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "docker_compose_ps_invalid_json",
            message:
              error instanceof Error
                ? `docker compose ps returned invalid JSON: ${error.message}`
                : "docker compose ps returned invalid JSON.",
            details: result,
          },
          metadata: {
            adapter: "cli",
            command: "docker",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            truncated: result.truncated,
          },
        };
      }
    },
  };
}

function validateDockerImagesInput(
  input: unknown,
): ToolValidationResult<DockerImagesInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      all: normalizeBoolean(input.all, false),
      dangling: normalizeBoolean(input.dangling, false),
      maxImages: normalizePositiveInteger(input.maxImages, 50, 500),
    },
  };
}

function buildDockerImagesArgs(input: DockerImagesInput): string[] {
  const args = [
    "image",
    "ls",
    "--no-trunc",
    "--format",
    "{{json .}}",
  ];

  if (input.all) {
    args.splice(2, 0, "--all");
  }

  if (input.dangling) {
    args.push("--filter", "dangling=true");
  }

  return args;
}

function parseDockerImagesOutput(stdout: string): DockerImageSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;

        if (!isRecord(parsed)) {
          return [];
        }

        return [
          {
            id: getStringField(parsed, "ID"),
            repository: getStringField(parsed, "Repository"),
            tag: getStringField(parsed, "Tag"),
            digest: getStringField(parsed, "Digest"),
            createdAt: getStringField(parsed, "CreatedAt"),
            createdSince: getStringField(parsed, "CreatedSince"),
            size: getStringField(parsed, "Size"),
            sharedSize: getStringField(parsed, "SharedSize"),
            uniqueSize: getStringField(parsed, "UniqueSize"),
            virtualSize: getStringField(parsed, "VirtualSize"),
            containers: getStringField(parsed, "Containers"),
            raw: parsed,
          },
        ];
      } catch {
        return [];
      }
    });
}

function createDockerImagesError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerImagesResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_images_timed_out",
        message: "docker image ls timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_images_failed",
      message:
        result.stderr.trim() ||
        `docker image ls failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerImagesTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerImagesInput, DockerImagesResult> {
  return {
    name: "docker.images",
    description:
      "List Docker images using docker image ls through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description:
            "When true, include intermediate images using docker image ls --all.",
        },
        dangling: {
          type: "boolean",
          description:
            "When true, only include dangling images using --filter dangling=true.",
        },
        maxImages: {
          type: "number",
          description:
            "Maximum number of Docker images to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerImagesInput,
    async execute(input, context) {
      const args = buildDockerImagesArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerImagesError(result);
      }

      const images = parseDockerImagesOutput(result.stdout).slice(
        0,
        input.maxImages,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          all: input.all,
          dangling: input.dangling,
          maxImages: input.maxImages,
          count: images.length,
          images,
          command: {
            command: "docker",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "docker",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function validateDockerNetworksInput(
  input: unknown,
): ToolValidationResult<DockerNetworksInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      maxNetworks: normalizePositiveInteger(input.maxNetworks, 100, 500),
    },
  };
}

function buildDockerNetworksArgs(): string[] {
  return [
    "network",
    "ls",
    "--no-trunc",
    "--format",
    "{{json .}}",
  ];
}

function parseDockerNetworksOutput(stdout: string): DockerNetworkSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;

        if (!isRecord(parsed)) {
          return [];
        }

        return [
          {
            id: getStringField(parsed, "ID"),
            name: getStringField(parsed, "Name"),
            driver: getStringField(parsed, "Driver"),
            scope: getStringField(parsed, "Scope"),
            ipv6: getStringField(parsed, "IPv6"),
            internal: getStringField(parsed, "Internal"),
            labels: getStringField(parsed, "Labels"),
            raw: parsed,
          },
        ];
      } catch {
        return [];
      }
    });
}

function createDockerNetworksError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerNetworksResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_networks_timed_out",
        message: "docker network ls timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_networks_failed",
      message:
        result.stderr.trim() ||
        `docker network ls failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerNetworksTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerNetworksInput, DockerNetworksResult> {
  return {
    name: "docker.networks",
    description:
      "List Docker networks using docker network ls through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        maxNetworks: {
          type: "number",
          description:
            "Maximum number of Docker networks to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerNetworksInput,
    async execute(input, context) {
      const args = buildDockerNetworksArgs();

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerNetworksError(result);
      }

      const networks = parseDockerNetworksOutput(result.stdout).slice(
        0,
        input.maxNetworks,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          maxNetworks: input.maxNetworks,
          count: networks.length,
          networks,
          command: {
            command: "docker",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "docker",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function validateDockerVolumesInput(
  input: unknown,
): ToolValidationResult<DockerVolumesInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      dangling: normalizeBoolean(input.dangling, false),
      maxVolumes: normalizePositiveInteger(input.maxVolumes, 100, 500),
    },
  };
}

function buildDockerVolumesArgs(input: DockerVolumesInput): string[] {
  const args = [
    "volume",
    "ls",
    "--format",
    "{{json .}}",
  ];

  if (input.dangling) {
    args.push("--filter", "dangling=true");
  }

  return args;
}

function parseDockerVolumesOutput(stdout: string): DockerVolumeSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;

        if (!isRecord(parsed)) {
          return [];
        }

        return [
          {
            name: getStringField(parsed, "Name"),
            driver: getStringField(parsed, "Driver"),
            scope: getStringField(parsed, "Scope"),
            mountpoint: getStringField(parsed, "Mountpoint"),
            labels: getStringField(parsed, "Labels"),
            links: getStringField(parsed, "Links"),
            size: getStringField(parsed, "Size"),
            raw: parsed,
          },
        ];
      } catch {
        return [];
      }
    });
}

function createDockerVolumesError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<DockerVolumesResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "docker_volumes_timed_out",
        message: "docker volume ls timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "docker",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "docker_volumes_failed",
      message:
        result.stderr.trim() ||
        `docker volume ls failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "docker",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createDockerVolumesTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerVolumesInput, DockerVolumesResult> {
  return {
    name: "docker.volumes",
    description:
      "List Docker volumes using docker volume ls through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        dangling: {
          type: "boolean",
          description:
            "When true, only include dangling volumes using --filter dangling=true.",
        },
        maxVolumes: {
          type: "number",
          description:
            "Maximum number of Docker volumes to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerVolumesInput,
    async execute(input, context) {
      const args = buildDockerVolumesArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerVolumesError(result);
      }

      const volumes = parseDockerVolumesOutput(result.stdout).slice(
        0,
        input.maxVolumes,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          dangling: input.dangling,
          maxVolumes: input.maxVolumes,
          count: volumes.length,
          volumes,
          command: {
            command: "docker",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "docker",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export function createDockerPsTool(
  runCommand: CliCommandRunner = executeCliCommand,
): ToolDefinition<DockerPsInput, DockerPsResult> {
  return {
    name: "docker.ps",
    description:
      "List Docker containers using docker ps through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Docker commands.",
    inputSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description:
            "When true, include stopped containers using docker ps --all.",
        },
        includeSize: {
          type: "boolean",
          description:
            "When true, include container size information using docker ps --size.",
        },
        maxContainers: {
          type: "number",
          description:
            "Maximum number of containers to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: DOCKER_PS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateDockerPsInput,
    async execute(input, context) {
      const args = buildDockerPsArgs(input);

      const result = await runCommand({
        command: "docker",
        args,
        cwd: context.cwd,
        timeoutMs: DOCKER_PS_TIMEOUT_MS,
        maxOutputChars: DOCKER_PS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createDockerPsError(result);
      }

      const containers = parseDockerPsOutput(result.stdout).slice(
        0,
        input.maxContainers,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          all: input.all,
          includeSize: input.includeSize,
          maxContainers: input.maxContainers,
          count: containers.length,
          containers,
          command: {
            command: "docker",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "docker",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export const dockerPsTool = createDockerPsTool();
export const dockerInspectTool = createDockerInspectTool();
export const dockerLogsTool = createDockerLogsTool();
export const dockerComposePsTool = createDockerComposePsTool();
export const dockerImagesTool = createDockerImagesTool();
export const dockerNetworksTool = createDockerNetworksTool();
export const dockerVolumesTool = createDockerVolumesTool();