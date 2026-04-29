# Repository Guidelines

## Project Context

Orqent is a local-first TypeScript CLI/TUI built with React + Ink.

The project is no longer just a model selector or prompt composer. It is now an early local agent runtime powered by Ollama, with:

- real chat streaming through Ollama,
- persisted chat sessions and transcripts,
- resumable session IDs,
- configurable Ollama host/model/generation options/thinking mode,
- context compaction,
- XML-like tool call protocol,
- tool execution loop with result reinjection,
- permission policy and interactive confirmation,
- filesystem/project/shell tools,
- persistent agent definitions,
- isolated subagent instances,
- queued background subagent tasks,
- child-agent inspection and transcript reading.

Keep the scope honest:

- Orqent has a real local agent loop now.
- Synchronous subagent execution exists, but currently performs a direct model call with isolated context.
- Subagents do not yet have their own internal tool-calling loop.
- Background tasks are persisted and can be executed explicitly, but automatic background workers are not implemented yet.
- The runtime is local-first, but it still depends on Ollama being available at the configured host.
- Do not describe Orqent as a complete Claude Code/Codex replacement yet.

The correct direction is still: local-first, runtime-driven, permission-aware, testable, and explicit.

## Project Structure & Module Organization

- `src/index.tsx`: executable entrypoint with Node shebang.
- `src/cli.ts`: CLI flag handling and app bootstrap.
- `src/run-app.tsx`: Ink renderer, terminal clearing, controlled exit, and session resume hint.
- `src/app.tsx`: active runtime composition. Wires app shell, Ollama connection/model loading, chat loop, session persistence, tool calling, permissions, context compaction, and agent catalog injection.
- `src/components/`: reusable Ink UI components such as layout and selectable lists.
- `src/screens/`: screen-level TUI views.
  - `home.tsx`: chat/composer screen.
  - `config-select.tsx`: Ollama host selection/configuration.
  - `model-select.tsx`: model selection.
  - `generation-options.tsx`: generation parameters.
  - `thinking-mode.tsx`: Ollama thinking mode.
  - `permission-mode.tsx`: runtime permission mode.
- `src/shell/app-shell/`: active shell state, view routing, persisted shell config, permission mode state, and slash-command routing.
- `src/models/ollama/`: Ollama boundary.
  - `client.ts`: Ollama client factory.
  - `config.ts`: defaults and host normalization.
  - `connection.ts`: `/api/version` ping.
  - `models.ts`: model listing and embedding model filtering.
  - `storage.ts`: persisted Ollama config.
  - `use-ollama-connection.ts`: React connection status hook.
  - `use-ollama-models.ts`: React model loading hook.
  - `types.ts`: Ollama config, generation options, model item, and thinking mode types.
- `src/runtime/`: agent runtime layer.
  - `ollama-runtime.ts`: generate/chat streaming and compaction calls.
  - `agent-loop.ts`: model tool-call execution bridge.
  - `tool-call-protocol.ts`: XML-like model tool-call parser/instructions.
  - `tool-result-message.ts`: structured tool-result reinjection.
  - `context-policy.ts`: context compaction planning.
  - `system-prompt.ts`: default and persisted system prompt loading.
  - `subagent-runner.ts`: isolated synchronous subagent execution.
  - `background-task-runner.ts`: explicit execution of queued background subagent tasks.
- `src/tools/`: tool registry, router, types, and builtin tools.
  - Builtins currently include filesystem, project search, shell execution, and agent tools.
- `src/security/`: permission mode, permission policy, rule evaluation, and policy builder.
- `src/sessions/`: persisted chat sessions, chat metadata index, transcripts, and tool action logs.
- `src/agents/`: persistent agent definitions, registry, prompts, instances, state storage, transcript storage, background task storage, and parent-child coordination.
- `src/core/`, `src/state/`, `src/lib/`: older prototype app/task state and storage. Some CLI reset tests still depend on this path. Do not extend it for new agent runtime features unless the change is explicitly about legacy cleanup.
- `src/**/__tests__/` and `src/__tests__/`: Vitest suites.
- `dist/`: generated build output. Do not edit manually.

## Build, Test, and Development Commands

- `npm run dev`: watch mode through `tsx watch src/index.tsx`.
- `npm start`: run the app once from source.
- `npm run typecheck`: TypeScript check with no emit.
- `npm run build`: bundle CLI to `dist/` using `tsup` as ESM targeting Node 20.
- `npm run cli`: run the built artifact with `node dist/index.js`.
- `npm test`: interactive Vitest.
- `npm run test:run`: single-pass Vitest run.
- `npm run test:coverage`: V8 coverage report.

Before submitting code changes, run:

```sh
npm run test:run && npm run typecheck
```

For CLI integration tests that execute the built artifact, build first:

```sh
npm run build && npm run test:run
```

For runtime/Ollama manual verification:

```sh
ollama list
npm start
```

## Coding Style & Naming Conventions

- Language: TypeScript with ESM.
- React renderer: Ink.
- Keep TypeScript strict.
- Keep relative imports compatible with emitted ESM. Use explicit `.js` extensions for local runtime imports.
- Use PascalCase for React components.
- Use camelCase for functions, variables, hooks, and state fields.
- Use kebab-case for multi-word file names unless an existing nearby convention differs.
- Keep pure runtime logic outside Ink components.
- Keep Ollama-specific API logic under `src/models/ollama/`.
- Keep app shell state/routing under `src/shell/app-shell/`.
- Keep model/tool orchestration under `src/runtime/`.
- Keep tool definitions under `src/tools/`.
- Keep persistent agent logic under `src/agents/`.
- Do not bury filesystem, shell, session, or agent state mutations inside screen components.

No formatter or linter is currently configured. Match the style of the surrounding file.

## UI Guidelines

- Prefer Ink primitives (`Box`, `Text`, `useInput`, `useWindowSize`) for terminal UI.
- Prefer Ink color/background props for TUI styling.
- Keep keyboard behavior explicit and predictable:
  - `q` or `Esc` should go back or exit depending on screen context.
  - `↑/↓` and `j/k` should navigate selectable lists.
  - `Enter` should select/submit.
  - `/exit` and `/quit` should terminate Orqent cleanly.
  - `Ctrl+C` should use Orqent’s controlled exit path, not Ink’s default exit.

- Preserve the resume hint on exit when a session exists.
- For tool confirmation, keep the interaction simple:
  - `y` or `s` allows.
  - `n` denies.

- For model selection, preserve a clear distinction between:
  - focused/cursor item,
  - currently active model,
  - metadata line.

- Avoid adding visual labels that can overlap in narrow terminals. Prefer color, symbols, spacing, and footer summaries.

## Slash Commands

Keep slash commands routed through the app shell or app-level command handler.

Current command categories include:

- navigation: `/home`, `/config`, `/model`,
- generation settings: params/options screen,
- thinking mode screen,
- permission mode screen,
- exit commands: `/exit`, `/quit`.

When adding a command:

- keep command parsing deterministic,
- normalize casing and whitespace,
- avoid side effects inside the screen,
- test routing behavior when possible,
- keep unknown commands non-fatal.

## Ollama Guidelines

Current supported Ollama behavior:

- Default local host: `http://localhost:11434`.
- Host normalization trims whitespace, removes trailing slashes, and strips a trailing `/api`.
- `createOllamaClient(host)` is the only place that should instantiate the Ollama JS client.
- `pingOllamaHost(host)` checks `/api/version` with timeout.
- `listOllamaModels(host)` maps Ollama model metadata into `OllamaModelItem`.
- Embedding models are filtered out of normal chat model selection.
- Ollama config is persisted in `~/.orqent/ollama-config.json` unless `ORQENT_DATA_DIR` is set.
- Generation options include:
  - `temperature`,
  - `topP`,
  - `topK`,
  - `numCtx`,
  - `numPredict`,
  - `repeatPenalty`.

- Thinking mode supports:
  - `default`,
  - `disabled`,
  - `enabled`,
  - `low`,
  - `medium`,
  - `high`.

When adding Ollama features:

- Do not call Ollama directly from screens.
- Add API/runtime logic under `src/models/ollama/` or `src/runtime/`.
- Keep React loading/error state in hooks.
- Do not require a running Ollama daemon in unit tests. Mock the Ollama boundary.
- Do not assume `gemma4:e4b` is installed. Always handle empty model lists, missing active model, connection failures, and stream errors.
- Do not silently include embedding models in chat model selection.
- Do not claim a model supports a feature unless the runtime actually sends and handles that option.

## Runtime Guidelines

The runtime is responsible for orchestration. The model only produces text and tool-call requests.

Current runtime responsibilities include:

- building the effective system prompt,
- injecting current working directory context,
- loading persistent system prompt from disk,
- injecting persistent agent catalog,
- injecting tool-call protocol instructions,
- streaming chat from Ollama,
- suppressing visible tool-call XML while streaming,
- parsing model tool-call blocks,
- executing tools through the registry/router,
- reinjecting tool results as user-role runtime messages,
- limiting tool-call rounds per prompt,
- appending chat transcript entries,
- appending tool action logs,
- compacting older context when policy requires it.

Do not execute model output directly.

Correct flow:

1. Model requests a tool using the exact protocol.
2. Runtime parses and validates the request.
3. Runtime checks the tool registry.
4. Runtime validates input.
5. Runtime evaluates permissions.
6. Runtime asks the user when required.
7. Runtime executes the tool.
8. Runtime persists the tool action log.
9. Runtime returns structured `tool_result` to the model.
10. Model answers based on that result.

The tool-call round limit exists to prevent loops. Do not remove it without adding a stronger loop-control mechanism.

## Tool Calling Protocol

Model tool calls use the XML-like block handled by `src/runtime/tool-call-protocol.ts`.

Rules:

- The model may request at most one tool call per assistant turn.
- The tool call must use a known `toolName`.
- The input must be a JSON object matching the selected tool schema.
- The model must not claim the tool ran until a `tool_result` is provided.
- After a `tool_result`, the model must treat it as ground truth.
- Invalid tool-call blocks should produce a controlled fallback response, not crash the TUI.

When changing the protocol:

- update parser tests,
- update system prompt/tool instructions,
- update result reinjection tests,
- test invalid JSON, multiple tool calls, unknown tools, and surrounding prose behavior.

## Builtin Tool Guidelines

Current builtin registry includes:

- `filesystem.list`
- `filesystem.read`
- `filesystem.write`
- `project.search`
- `shell.execute`
- `agent.create_definition`
- `agent.list_definitions`
- `agent.spawn`
- `agent.list_tasks`
- `agent.read_transcript`
- `agent.list_background_tasks`
- `agent.run_background_task`
- `agent.inspect_children`

When adding or changing tools:

- define a clear input schema,
- validate input manually and return typed errors,
- mark risk accurately,
- define permissions accurately,
- set `requiresConfirmation` correctly,
- set `isReadOnly` correctly,
- keep execution inside the tool layer,
- never let tools escape their intended boundary accidentally,
- add tests through `executeTool`,
- include permission-denied tests,
- include invalid-input tests.

Filesystem and project tools must resolve paths safely inside the current working directory unless the tool explicitly supports another trusted boundary.

Shell execution is high risk. It must stay permission-gated and must never run without explicit policy approval or user confirmation.

## Permission & Safety Guidelines

Permission behavior is part of the runtime contract.

Current permission modes:

- `ask`
- `allow`
- `deny`

General rules:

- `deny` blocks tool execution.
- `allow` allows unless a deny rule matches.
- `ask` allows low-risk read-only tools but asks for confirmation when:
  - the tool requires confirmation,
  - the tool can modify external state,
  - the tool is medium/high risk,
  - a policy rule requires asking.

When changing permissions:

- update `src/security/`,
- keep permission evaluation pure and testable,
- test allow, ask, deny, and rule precedence,
- persist/log permission effect and reason in tool action entries,
- do not bypass confirmation in UI flows,
- do not treat model intent as permission.

## Session Persistence Guidelines

Chat sessions are persisted under `~/.orqent/sessions/` unless `ORQENT_DATA_DIR` is set.

Current session persistence includes:

- session metadata index,
- transcript JSONL per session,
- tool action JSONL per session,
- session IDs generated with timestamp + UUID,
- safe session filenames,
- transcript hydration for resumed sessions,
- message count and last preview metadata.

When changing sessions:

- preserve JSONL append behavior for transcripts and tool logs,
- tolerate missing/corrupt files by returning safe defaults,
- keep metadata index sorted by `updatedAt` descending,
- do not store unserializable data,
- keep `ORQENT_DATA_DIR` support for tests,
- preserve resume behavior and exit hints.

Do not mix legacy `src/lib/storage.ts` prototype state with chat session storage. They are different persistence layers.

## System Prompt & Context Guidelines

The default system prompt lives in `src/runtime/system-prompt.ts`.

Runtime system prompt construction may include:

- base system prompt,
- compacted context summary,
- current working directory runtime context,
- persistent agent catalog,
- tool-call protocol instructions.

Context compaction is handled by `src/runtime/context-policy.ts` and `compactChatHistoryWithOllama`.

When changing compaction:

- keep summaries in the same language as the compacted conversation,
- preserve user preferences,
- preserve technical decisions,
- preserve project state,
- preserve relevant errors,
- preserve pending tasks,
- preserve important filenames and commands,
- do not invent information,
- test compaction planning separately from Ollama calls.

## Agent Definition Guidelines

Agent definitions are persistent runtime objects, not prompt roleplay.

An agent definition includes:

- `identifier`,
- `name`,
- `whenToUse`,
- `systemPrompt`,
- `allowedTools`,
- `model`,
- `scope`,
- `memoryScope`,
- `permissionMode`,
- timestamps,
- optional metadata.

Agent definition storage lives under `~/.orqent/agents/definitions.json` unless `ORQENT_DATA_DIR` is set.

Rules:

- identifiers are normalized to lowercase,
- identifiers must use letters, numbers, `.`, `_`, or `-`,
- `whenToUse` is required,
- `systemPrompt` is required,
- `allowedTools` are normalized and deduplicated,
- listing definitions must not expose private `systemPrompt` unless explicitly intended.

When adding agent features:

- keep definitions separate from instances,
- keep persistence separate from execution,
- test normalization and invalid identifiers,
- do not let the model invent persistent agents without going through `agent.create_definition`.

## Subagent Runtime Guidelines

A subagent is not “just another prompt”.

A subagent instance means:

- persistent `instanceId`,
- persistent `taskId`,
- parent session ID,
- isolated context,
- isolated transcript,
- selected/fallback model,
- copied system prompt from definition,
- allowed tool boundary,
- lifecycle status,
- result or error.

Current synchronous subagent execution:

- creates/persists instance and task state,
- writes isolated transcript entries,
- builds an isolated subagent system prompt,
- calls Ollama directly,
- marks instance/task completed or failed,
- stores the result/error.

Current limitation:

- subagents do not yet run their own internal tool loop.
- `allowedTools` are currently an intended boundary, not an active internal execution pool.

Do not claim a subagent inspected files, ran commands, modified files, or used tools unless the returned tool result explicitly proves it.

## Background Subagent Task Guidelines

Background task support currently means persisted queued tasks plus explicit execution.

Current behavior:

- `agent.spawn` with `executeNow=false` and `runInBackground=true` creates a queued background task.
- `agent.run_background_task` executes a queued background task explicitly.
- Automatic background workers are not implemented yet.
- Background tasks can be listed, marked running, completed, failed, cancelled, and heartbeated.

Rules:

- never set `executeNow=true` and `runInBackground=true` together,
- queued does not mean executed,
- completed means a real execution result exists,
- failed means a real error was persisted,
- do not report background output unless `execution.status` is `completed`.

## Parent-Child Agent Coordination

Use `agent.inspect_children` for parent session coordination.

It may consolidate:

- child instance state,
- task state,
- background task state,
- result/error,
- isolated transcript entries.

Rules:

- treat child inspection output as ground truth,
- summarize only present children/results/errors/transcripts,
- do not invent parent conversation data,
- do not invent external tool use,
- report queued/running/completed/failed exactly.

## Testing Guidelines

Framework: Vitest.

Prioritize tests for:

- pure reducers and policy functions,
- Ollama config normalization,
- Ollama model filtering,
- Ollama connection result mapping,
- context policy planning,
- tool-call parsing,
- tool-result message construction,
- tool router behavior,
- permission evaluation,
- filesystem/project/shell tools,
- session storage,
- agent definition storage,
- agent instance/task state storage,
- agent transcript storage,
- background task storage,
- subagent runner,
- background task runner,
- parent-child coordination,
- CLI flags.

Avoid brittle terminal-render tests unless output stability matters.

Do not chase 100% coverage blindly. Coverage is useful for runtime logic, persistence, safety boundaries, and tool behavior. Ink rendering branches are lower priority unless they protect a known bug.

## Security & Execution Boundaries

Orqent is intended to execute local actions. Treat every execution path as security-sensitive.

Required rules:

- validate every tool input,
- separate read-only tools from mutating tools,
- require confirmation for destructive or high-risk operations,
- log tool actions,
- preserve cwd boundaries,
- prevent unsafe path traversal,
- keep shell execution permission-gated,
- never execute raw model text as code,
- never allow a model to bypass permission policy,
- never treat `allowedTools` on an agent definition as direct permission from the parent conversation,
- keep cancellation/timeouts where external execution can hang.

When uncertain, fail closed.

## Legacy/Prototype Code

`src/core/`, `src/state/`, and parts of `src/lib/` came from the earlier task-dashboard prototype.

Rules:

- Do not build new agent runtime features on top of the prototype task app.
- Do not delete prototype code casually; CLI reset/tests may still reference it.
- If removing it, do a dedicated cleanup PR with tests updated.
- New runtime persistence should use `src/sessions/`, `src/models/ollama/storage.ts`, `src/shell/app-shell/storage.ts`, or `src/agents/` as appropriate.

## Commit & Pull Request Guidelines

Use Conventional Commits:

- `feat(runtime): add tool result reinjection`
- `fix(ollama): filter embedding models from selector`
- `test(agents): cover background task execution`
- `refactor(tools): isolate shell execution validation`
- `fix(sessions): preserve transcript order on resume`

PRs should include:

- clear summary of behavior changes,
- screenshots/GIFs for TUI changes,
- notes on Ollama assumptions,
- notes on permission/security impact,
- tests added or updated,
- manual verification commands run.

## Verification Checklist

Before opening a PR:

```sh
npm run test:run
npm run typecheck
npm run build
npm run cli
```

For Ollama/runtime changes, also verify manually:

```sh
ollama list
npm start
```

Then check:

- `/model` loads non-embedding chat models or shows a clear error.
- Active model is visually distinguishable from focused model.
- `/config` changes host and connection status updates.
- `/params` updates generation options.
- `/thinking` updates thinking mode.
- `/permissions` updates permission mode.
- Footer shows current model, host, context/status, and connection state.
- Normal chat streams a response.
- Tool calls are hidden from user-facing streaming output.
- Tool results are reinjected and final answer is grounded.
- Risky tools request confirmation.
- `y`/`s` approves a pending tool.
- `n` denies a pending tool.
- `/exit`, `/quit`, and `Ctrl+C` exit cleanly.
- Exit prints a resumable session command when a session exists.
- Resumed sessions hydrate prior user/assistant messages.
- Context compaction does not drop recent messages.
- Agent definition creation persists under the agents directory.
- `agent.spawn` prepared/background/completed/failed states are reported honestly.
- Queued background tasks are not described as executed until `agent.run_background_task` runs.
- `agent.inspect_children` reports only persisted child-agent data.
