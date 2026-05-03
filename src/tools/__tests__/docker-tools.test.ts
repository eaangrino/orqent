import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, executeTool } from "../index.js";
import {
  createDockerComposePsTool,
  createDockerImagesTool,
  createDockerInspectTool,
  createDockerLogsTool,
  createDockerNetworksTool,
  createDockerPsTool,
  createDockerPullTool,
  createDockerVolumesTool,
  createDockerComposeUpTool,
  createDockerComposeDownTool,
  createDockerContainerActionTool,
  createDockerRmTool,
  createDockerExecTool,
  type DockerExecResult,
  type DockerRmResult,
  type DockerContainerActionResult,
  type DockerComposeDownResult,
  type DockerComposeUpResult,
  type CliCommandRunner,
  type DockerComposePsResult,
  type DockerImagesResult,
  type DockerInspectResult,
  type DockerLogsResult,
  type DockerNetworksResult,
  type DockerPsResult,
  type DockerPullResult,
  type DockerVolumesResult,
} from "../builtin/docker.js";
import { defaultToolRegistry } from "../registry.js";

function createCliResult(overrides: Partial<Awaited<ReturnType<CliCommandRunner>>> = {}) {
  return {
    command: "docker",
    args: [ "ps" ],
    cwd: "/tmp/project",
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    durationMs: 12,
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

describe("docker tools", () => {
  it("registra docker.ps en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.ps")).toBe(true);
  });

  it("docker.ps ejecuta docker ps mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify({
          ID: "container-id",
          Image: "postgres:16",
          Command: "\"docker-entrypoint.sh\"",
          CreatedAt: "2026-04-30 10:00:00 -0500 -05",
          RunningFor: "2 hours ago",
          Ports: "0.0.0.0:5432->5432/tcp",
          Names: "postgres_local",
          State: "running",
          Status: "Up 2 hours",
          Networks: "bridge",
        }) + "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerPsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.ps",
      input: {
        all: true,
        includeSize: false,
        maxContainers: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [ "ps", "--all", "--no-trunc", "--format", "{{json .}}" ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerPsResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.containers[ 0 ]).toMatchObject({
      id: "container-id",
      image: "postgres:16",
      names: "postgres_local",
      state: "running",
      status: "Up 2 hours",
    });
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "docker",
      exitCode: 0,
    });
  });

  it("docker.ps limita la cantidad de contenedores devueltos", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout:
          JSON.stringify({ ID: "one", Image: "nginx", Names: "one" }) +
          "\n" +
          JSON.stringify({ ID: "two", Image: "redis", Names: "two" }) +
          "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerPsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.ps",
      input: {
        maxContainers: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const dockerResult = result.result as DockerPsResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.containers[ 0 ]?.id).toBe("one");
  });

  it("docker.ps devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "Cannot connect to the Docker daemon",
      }),
    );

    const registry = createToolRegistry([ createDockerPsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.ps",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.ps to fail.");
    }

    expect(result.error.code).toBe("docker_ps_failed");
    expect(result.error.message).toBe("Cannot connect to the Docker daemon");
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "docker",
      exitCode: 1,
    });
  });

  it("docker.ps devuelve error específico por timeout", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: null,
        timedOut: true,
      }),
    );

    const registry = createToolRegistry([ createDockerPsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.ps",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.ps to fail.");
    }

    expect(result.error.code).toBe("docker_ps_timed_out");
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "docker",
      timedOut: true,
    });
  });
  it("registra docker.inspect en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.inspect")).toBe(true);
  });

  it("docker.inspect ejecuta docker inspect mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify([
          {
            Id: "container-id",
            Name: "/postgres_local",
            Config: {
              Image: "postgres:16",
            },
          },
        ]),
      }),
    );

    const registry = createToolRegistry([ createDockerInspectTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.inspect",
      input: {
        target: "postgres_local",
        type: "container",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [ "inspect", "--type", "container", "postgres_local" ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerInspectResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.target).toBe("postgres_local");
    expect(dockerResult.type).toBe("container");
    expect(dockerResult.items[ 0 ]).toMatchObject({
      Id: "container-id",
      Name: "/postgres_local",
    });
  });

  it("docker.inspect rechaza target vacío", async () => {
    const registry = createToolRegistry([ createDockerInspectTool() ]);

    const result = await executeTool({
      registry,
      toolName: "docker.inspect",
      input: {
        target: "",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.inspect to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("target must be a non-empty string.");
  });

  it("docker.inspect devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "No such object: missing",
      }),
    );

    const registry = createToolRegistry([ createDockerInspectTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.inspect",
      input: {
        target: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.inspect to fail.");
    }

    expect(result.error.code).toBe("docker_inspect_failed");
    expect(result.error.message).toBe("No such object: missing");
  });

  it("registra docker.logs en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.logs")).toBe(true);
  });

  it("docker.logs ejecuta docker logs mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "linea 1\nlinea 2\n",
      }),
    );

    const registry = createToolRegistry([ createDockerLogsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.logs",
      input: {
        target: "postgres_local",
        tail: 25,
        since: "10m",
        timestamps: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "logs",
          "--tail",
          "25",
          "--timestamps",
          "--since",
          "10m",
          "postgres_local",
        ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerLogsResult;

    expect(dockerResult.stdout).toBe("linea 1\nlinea 2\n");
    expect(dockerResult.target).toBe("postgres_local");
    expect(dockerResult.tail).toBe(25);
    expect(dockerResult.since).toBe("10m");
    expect(dockerResult.timestamps).toBe(true);
  });

  it("docker.logs requiere confirmación por posible exposición de secretos", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([ createDockerLogsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.logs",
      input: {
        target: "postgres_local",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No leer logs ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.logs to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.logs devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "No such container: missing",
      }),
    );

    const registry = createToolRegistry([ createDockerLogsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.logs",
      input: {
        target: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.logs to fail.");
    }

    expect(result.error.code).toBe("docker_logs_failed");
    expect(result.error.message).toBe("No such container: missing");
  });

  it("registra docker.compose_ps en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.compose_ps")).toBe(true);
  });

  it("docker.compose_ps ejecuta docker compose ps mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify([
          {
            ID: "service-id",
            Name: "orqent-db-1",
            Command: "docker-entrypoint.sh postgres",
            Project: "orqent",
            Service: "db",
            State: "running",
            Health: "healthy",
            ExitCode: 0,
            Publishers: [
              {
                URL: "0.0.0.0",
                TargetPort: 5432,
                PublishedPort: 5432,
                Protocol: "tcp",
              },
            ],
          },
        ]),
      }),
    );

    const registry = createToolRegistry([
      createDockerComposePsTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_ps",
      input: {
        all: true,
        services: [ "db" ],
        maxServices: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [ "compose", "ps", "--format", "json", "--all", "db" ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerComposePsResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.servicesFound[ 0 ]).toMatchObject({
      id: "service-id",
      name: "orqent-db-1",
      project: "orqent",
      service: "db",
      state: "running",
      health: "healthy",
      exitCode: 0,
    });
  });

  it("docker.compose_ps limita la cantidad de servicios devueltos", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify([
          {
            ID: "one",
            Name: "service-one",
            Service: "one",
          },
          {
            ID: "two",
            Name: "service-two",
            Service: "two",
          },
        ]),
      }),
    );

    const registry = createToolRegistry([
      createDockerComposePsTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_ps",
      input: {
        maxServices: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const dockerResult = result.result as DockerComposePsResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.servicesFound[ 0 ]?.id).toBe("one");
  });

  it("docker.compose_ps devuelve error controlado cuando docker compose falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "no configuration file provided",
      }),
    );

    const registry = createToolRegistry([
      createDockerComposePsTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_ps",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.compose_ps to fail.");
    }

    expect(result.error.code).toBe("docker_compose_ps_failed");
    expect(result.error.message).toBe("no configuration file provided");
  });

  it("registra docker.images en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.images")).toBe(true);
  });

  it("docker.images ejecuta docker image ls mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify({
          ID: "sha256:image-id",
          Repository: "postgres",
          Tag: "16",
          Digest: "<none>",
          CreatedAt: "2026-04-30 10:00:00 -0500 -05",
          CreatedSince: "2 hours ago",
          Size: "432MB",
          SharedSize: "0B",
          UniqueSize: "432MB",
          VirtualSize: "432MB",
          Containers: "1",
        }) + "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerImagesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.images",
      input: {
        all: true,
        dangling: true,
        maxImages: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "image",
          "ls",
          "--all",
          "--no-trunc",
          "--format",
          "{{json .}}",
          "--filter",
          "dangling=true",
        ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerImagesResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.images[ 0 ]).toMatchObject({
      id: "sha256:image-id",
      repository: "postgres",
      tag: "16",
      size: "432MB",
      containers: "1",
    });
  });

  it("docker.images limita la cantidad de imágenes devueltas", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout:
          JSON.stringify({ ID: "one", Repository: "nginx", Tag: "latest" }) +
          "\n" +
          JSON.stringify({ ID: "two", Repository: "redis", Tag: "7" }) +
          "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerImagesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.images",
      input: {
        maxImages: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const dockerResult = result.result as DockerImagesResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.images[ 0 ]?.id).toBe("one");
  });

  it("docker.images devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "Cannot connect to the Docker daemon",
      }),
    );

    const registry = createToolRegistry([ createDockerImagesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.images",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.images to fail.");
    }

    expect(result.error.code).toBe("docker_images_failed");
    expect(result.error.message).toBe("Cannot connect to the Docker daemon");
  });

  it("registra docker.networks en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.networks")).toBe(true);
  });

  it("docker.networks ejecuta docker network ls mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify({
          ID: "network-id",
          Name: "orqent_default",
          Driver: "bridge",
          Scope: "local",
          IPv6: "false",
          Internal: "false",
          Labels: "com.docker.compose.project=orqent",
        }) + "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerNetworksTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.networks",
      input: {
        maxNetworks: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "network",
          "ls",
          "--no-trunc",
          "--format",
          "{{json .}}",
        ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerNetworksResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.networks[ 0 ]).toMatchObject({
      id: "network-id",
      name: "orqent_default",
      driver: "bridge",
      scope: "local",
    });
  });

  it("docker.networks limita la cantidad de redes devueltas", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout:
          JSON.stringify({ ID: "one", Name: "network-one" }) +
          "\n" +
          JSON.stringify({ ID: "two", Name: "network-two" }) +
          "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerNetworksTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.networks",
      input: {
        maxNetworks: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const dockerResult = result.result as DockerNetworksResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.networks[ 0 ]?.id).toBe("one");
  });

  it("docker.networks devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "Cannot connect to the Docker daemon",
      }),
    );

    const registry = createToolRegistry([ createDockerNetworksTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.networks",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.networks to fail.");
    }

    expect(result.error.code).toBe("docker_networks_failed");
    expect(result.error.message).toBe("Cannot connect to the Docker daemon");
  });

  it("registra docker.volumes en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.volumes")).toBe(true);
  });

  it("docker.volumes ejecuta docker volume ls mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: JSON.stringify({
          Name: "orqent_data",
          Driver: "local",
          Scope: "local",
          Mountpoint: "/var/lib/docker/volumes/orqent_data/_data",
          Labels: "com.docker.compose.project=orqent",
          Links: "N/A",
          Size: "N/A",
        }) + "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerVolumesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.volumes",
      input: {
        dangling: true,
        maxVolumes: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "volume",
          "ls",
          "--format",
          "{{json .}}",
          "--filter",
          "dangling=true",
        ],
        cwd: "/tmp/project",
      }),
    );

    const dockerResult = result.result as DockerVolumesResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.volumes[ 0 ]).toMatchObject({
      name: "orqent_data",
      driver: "local",
      scope: "local",
    });
  });

  it("docker.volumes limita la cantidad de volúmenes devueltos", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout:
          JSON.stringify({ Name: "one", Driver: "local" }) +
          "\n" +
          JSON.stringify({ Name: "two", Driver: "local" }) +
          "\n",
      }),
    );

    const registry = createToolRegistry([ createDockerVolumesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.volumes",
      input: {
        maxVolumes: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const dockerResult = result.result as DockerVolumesResult;

    expect(dockerResult.count).toBe(1);
    expect(dockerResult.volumes[ 0 ]?.name).toBe("one");
  });

  it("docker.volumes devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "Cannot connect to the Docker daemon",
      }),
    );

    const registry = createToolRegistry([ createDockerVolumesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.volumes",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.volumes to fail.");
    }

    expect(result.error.code).toBe("docker_volumes_failed");
    expect(result.error.message).toBe("Cannot connect to the Docker daemon");
  });

  it("registra docker.pull en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.pull")).toBe(true);
  });

  it("docker.pull ejecuta docker pull mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Status: Downloaded newer image for postgres:16\n",
      }),
    );

    const registry = createToolRegistry([ createDockerPullTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.pull",
      input: {
        image: "postgres:16",
        platform: "linux/amd64",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "pull",
          "--platform",
          "linux/amd64",
          "postgres:16",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerPullResult;

    expect(dockerResult.image).toBe("postgres:16");
    expect(dockerResult.platform).toBe("linux/amd64");
    expect(dockerResult.stdout).toContain("Downloaded newer image");
  });

  it("docker.pull requiere confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([ createDockerPullTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.pull",
      input: {
        image: "postgres:16",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No descargar imagen ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.pull to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.pull rechaza image vacío o peligroso", async () => {
    const registry = createToolRegistry([ createDockerPullTool() ]);

    const result = await executeTool({
      registry,
      toolName: "docker.pull",
      input: {
        image: "--all-tags",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.pull to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "image must be a non-empty Docker image reference without line breaks and must not start with '-'.",
    );
  });

  it("docker.pull devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "Error response from daemon: pull access denied",
      }),
    );

    const registry = createToolRegistry([ createDockerPullTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.pull",
      input: {
        image: "private/missing:latest",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.pull to fail.");
    }

    expect(result.error.code).toBe("docker_pull_failed");
    expect(result.error.message).toBe(
      "Error response from daemon: pull access denied",
    );
  });

  it("registra docker.compose_up en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.compose_up")).toBe(true);
  });

  it("docker.compose_up ejecuta docker compose up mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Container orqent-db-1 Started\n",
      }),
    );

    const registry = createToolRegistry([ createDockerComposeUpTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_up",
      input: {
        services: [ "db" ],
        detached: true,
        build: true,
        removeOrphans: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "compose",
          "up",
          "--detach",
          "--build",
          "--remove-orphans",
          "db",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerComposeUpResult;

    expect(dockerResult.services).toEqual([ "db" ]);
    expect(dockerResult.detached).toBe(true);
    expect(dockerResult.build).toBe(true);
    expect(dockerResult.removeOrphans).toBe(true);
    expect(dockerResult.stdout).toContain("Started");
  });

  it("docker.compose_up requiere confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([ createDockerComposeUpTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_up",
      input: {
        services: [ "db" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No levantar servicios ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.compose_up to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.compose_up ignora servicios peligrosos que empiezan por guion", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "ok\n",
      }),
    );

    const registry = createToolRegistry([ createDockerComposeUpTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_up",
      input: {
        services: [ "--profile", "db" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "compose",
          "up",
          "--detach",
          "db",
        ],
      }),
    );
  });

  it("docker.compose_up devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "no configuration file provided",
      }),
    );

    const registry = createToolRegistry([ createDockerComposeUpTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_up",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.compose_up to fail.");
    }

    expect(result.error.code).toBe("docker_compose_up_failed");
    expect(result.error.message).toBe("no configuration file provided");
  });

  it("registra docker.compose_down en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.compose_down")).toBe(true);
  });

  it("docker.compose_down ejecuta docker compose down mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Container orqent-db-1 Removed\nNetwork orqent_default Removed\n",
      }),
    );

    const registry = createToolRegistry([
      createDockerComposeDownTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_down",
      input: {
        removeOrphans: true,
        removeVolumes: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "compose",
          "down",
          "--remove-orphans",
          "--volumes",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerComposeDownResult;

    expect(dockerResult.removeOrphans).toBe(true);
    expect(dockerResult.removeVolumes).toBe(true);
    expect(dockerResult.stdout).toContain("Removed");
  });

  it("docker.compose_down requiere confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([
      createDockerComposeDownTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_down",
      input: {
        removeVolumes: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No bajar compose ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.compose_down to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.compose_down sin flags destructivos usa comando mínimo", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "ok\n",
      }),
    );

    const registry = createToolRegistry([
      createDockerComposeDownTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_down",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "compose",
          "down",
        ],
      }),
    );
  });

  it("docker.compose_down devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "no configuration file provided",
      }),
    );

    const registry = createToolRegistry([
      createDockerComposeDownTool(runCommand),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.compose_down",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.compose_down to fail.");
    }

    expect(result.error.code).toBe("docker_compose_down_failed");
    expect(result.error.message).toBe("no configuration file provided");
  });

  it("registra docker.stop, docker.start y docker.restart en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.stop")).toBe(true);
    expect(defaultToolRegistry.has("docker.start")).toBe(true);
    expect(defaultToolRegistry.has("docker.restart")).toBe(true);
  });

  it("docker.stop ejecuta docker stop mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "postgres_local\n",
      }),
    );

    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "stop",
        runCommand,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.stop",
      input: {
        target: "postgres_local",
        timeoutSeconds: 15,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "stop",
          "--time",
          "15",
          "postgres_local",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerContainerActionResult;

    expect(dockerResult.action).toBe("stop");
    expect(dockerResult.target).toBe("postgres_local");
    expect(dockerResult.timeoutSeconds).toBe(15);
  });

  it("docker.start ejecuta docker start sin timeout flag", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "postgres_local\n",
      }),
    );

    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "start",
        runCommand,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.start",
      input: {
        target: "postgres_local",
        timeoutSeconds: 15,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "start",
          "postgres_local",
        ],
      }),
    );
  });

  it("docker.restart ejecuta docker restart mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "postgres_local\n",
      }),
    );

    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "restart",
        runCommand,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.restart",
      input: {
        target: "postgres_local",
        timeoutSeconds: 20,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "restart",
          "--time",
          "20",
          "postgres_local",
        ],
      }),
    );
  });

  it("docker.stop/start/restart requieren confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "stop",
        runCommand,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.stop",
      input: {
        target: "postgres_local",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No detener contenedor ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.stop to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.stop rechaza target peligroso", async () => {
    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "stop",
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.stop",
      input: {
        target: "--all",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.stop to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "target must be a non-empty container name/id without line breaks and must not start with '-'.",
    );
  });

  it("docker.restart devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "No such container: missing",
      }),
    );

    const registry = createToolRegistry([
      createDockerContainerActionTool({
        action: "restart",
        runCommand,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "docker.restart",
      input: {
        target: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.restart to fail.");
    }

    expect(result.error.code).toBe("docker_restart_failed");
    expect(result.error.message).toBe("No such container: missing");
  });

  it("registra docker.rm en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.rm")).toBe(true);
  });

  it("docker.rm ejecuta docker rm mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "postgres_local\n",
      }),
    );

    const registry = createToolRegistry([ createDockerRmTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.rm",
      input: {
        target: "postgres_local",
        force: true,
        removeVolumes: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "rm",
          "--force",
          "--volumes",
          "postgres_local",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerRmResult;

    expect(dockerResult.target).toBe("postgres_local");
    expect(dockerResult.force).toBe(true);
    expect(dockerResult.removeVolumes).toBe(true);
  });

  it("docker.rm requiere confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([ createDockerRmTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.rm",
      input: {
        target: "postgres_local",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No eliminar contenedor ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.rm to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.rm rechaza target peligroso", async () => {
    const registry = createToolRegistry([ createDockerRmTool() ]);

    const result = await executeTool({
      registry,
      toolName: "docker.rm",
      input: {
        target: "--force",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.rm to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "target must be a non-empty container name/id without line breaks and must not start with '-'.",
    );
  });

  it("docker.rm devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "No such container: missing",
      }),
    );

    const registry = createToolRegistry([ createDockerRmTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.rm",
      input: {
        target: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.rm to fail.");
    }

    expect(result.error.code).toBe("docker_rm_failed");
    expect(result.error.message).toBe("No such container: missing");
  });

  it("registra docker.exec en el registry por defecto", () => {
    expect(defaultToolRegistry.has("docker.exec")).toBe(true);
  });

  it("docker.exec ejecuta docker exec mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "node version\n",
      }),
    );

    const registry = createToolRegistry([ createDockerExecTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.exec",
      input: {
        target: "app_container",
        command: "node",
        args: [ "--version" ],
        workdir: "/app",
        user: "node",
        env: {
          NODE_ENV: "test",
          "INVALID-KEY": "ignored",
        },
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "docker",
        args: [
          "exec",
          "--workdir",
          "/app",
          "--user",
          "node",
          "--env",
          "NODE_ENV=test",
          "app_container",
          "node",
          "--version",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const dockerResult = result.result as DockerExecResult;

    expect(dockerResult.target).toBe("app_container");
    expect(dockerResult.commandToRun).toBe("node");
    expect(dockerResult.argsToRun).toEqual([ "--version" ]);
    expect(dockerResult.workdir).toBe("/app");
    expect(dockerResult.user).toBe("node");
    expect(dockerResult.envKeys).toEqual([ "NODE_ENV" ]);
  });

  it("docker.exec requiere confirmación", async () => {
    const runCommand = vi.fn<CliCommandRunner>();
    const registry = createToolRegistry([ createDockerExecTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.exec",
      input: {
        target: "app_container",
        command: "node",
        args: [ "--version" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No ejecutar comandos dentro del contenedor ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.exec to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("docker.exec rechaza target peligroso", async () => {
    const registry = createToolRegistry([ createDockerExecTool() ]);

    const result = await executeTool({
      registry,
      toolName: "docker.exec",
      input: {
        target: "--privileged",
        command: "sh",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.exec to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "target must be a non-empty container name/id without line breaks and must not start with '-'.",
    );
  });

  it("docker.exec rechaza command peligroso", async () => {
    const registry = createToolRegistry([ createDockerExecTool() ]);

    const result = await executeTool({
      registry,
      toolName: "docker.exec",
      input: {
        target: "app_container",
        command: "--help",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.exec to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "command must be a non-empty command without line breaks and must not start with '-'.",
    );
  });

  it("docker.exec devuelve error controlado cuando docker falla", async () => {
    const runCommand = vi.fn<CliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stderr: "No such container: missing",
      }),
    );

    const registry = createToolRegistry([ createDockerExecTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "docker.exec",
      input: {
        target: "missing",
        command: "node",
        args: [ "--version" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected docker.exec to fail.");
    }

    expect(result.error.code).toBe("docker_exec_failed");
    expect(result.error.message).toBe("No such container: missing");
  });
});
