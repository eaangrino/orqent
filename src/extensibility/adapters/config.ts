/**
 * Persistent adapter configuration placeholder.
 *
 * This module is intentionally not implemented yet.
 * It is reserved for a future local configuration layer that lets Orqent
 * control how external adapters are executed without hardcoding every runtime
 * limit inside each builtin tool.
 *
 * Current architecture intent:
 * - Builtin tools such as Docker, Git, search, Node, npm, and nvm remain defined
 *   under src/tools/builtin.
 * - Those tools use adapter implementations from src/extensibility/adapters,
 *   mainly the CLI adapter, to execute external commands in a controlled way.
 * - This configuration layer should not replace tools and should not become a
 *   global tool registry switch.
 * - It should only provide persisted execution defaults and restrictions for
 *   adapter families.
 *
 * Intended minimum persisted shape:
 *
 * {
 *   "adapters": {
 *     "docker": {
 *       "enabled": true,
 *       "timeoutMs": 30000,
 *       "maxOutputChars": 50000
 *     },
 *     "git": {
 *       "enabled": true,
 *       "timeoutMs": 30000,
 *       "maxOutputChars": 50000
 *     },
 *     "search": {
 *       "enabled": true,
 *       "timeoutMs": 30000,
 *       "maxOutputChars": 100000
 *     },
 *     "node": {
 *       "enabled": true,
 *       "timeoutMs": 30000,
 *       "maxOutputChars": 20000
 *     },
 *     "npm": {
 *       "enabled": true,
 *       "timeoutMs": 120000,
 *       "maxOutputChars": 100000
 *     },
 *     "nvm": {
 *       "enabled": true,
 *       "timeoutMs": 120000,
 *       "maxOutputChars": 20000
 *     }
 *   }
 * }
 *
 * Intended behavior:
 * - If no config file exists, tools should keep using their current safe defaults.
 * - If a family config exists and is valid, builtin tools should use it to
 *   override timeoutMs and maxOutputChars before calling the adapter.
 * - If enabled=false for a family, tools in that family should fail before
 *   calling the underlying adapter.
 * - Invalid config values must be normalized or ignored in favor of safe defaults.
 * - The CLI adapter should remain generic. Builtin tools should resolve their
 *   family config before calling executeCliCommand.
 *
 * First implementation scope:
 * - Store config at ~/.orqent/adapters/config.json, respecting ORQENT_DATA_DIR.
 * - Support enabled, timeoutMs, and maxOutputChars only.
 * - Support adapter families: docker, git, search, node, npm, and nvm.
 * - Add storage, normalization, and read/upsert helpers.
 * - Add tests for missing files, corrupt files, invalid values, defaults,
 *   upsert behavior, and deletion/reset behavior if needed.
 * - Apply config only after storage behavior is covered by tests.
 *
 * Explicit non-goals for the first implementation:
 * - No UI screen.
 * - No slash command.
 * - No per-tool policy such as disabling only git.push.
 * - No global builtinTools.enabled switch.
 * - No permission model replacement.
 * - No plugin system integration.
 * - No MCP server configuration reuse.
 * - No HTTP adapter implementation.
 *
 * Future public behavior:
 * - Docker, Git, search, Node, npm, and nvm tools can resolve persisted adapter
 *   config before execution.
 * - Adapter execution limits become configurable while keeping hardcoded safe
 *   defaults as fallback.
 * - Tool action audit logs continue to record the actual execution result.
 *
 * This module should remain disconnected from runtime execution until the
 * storage layer, normalization rules, and tool integrations are tested.
 */

export async function loadAdapterConfigs() {}

export async function saveAdapterConfigs() {}

export async function readAdapterConfig() {}

export async function upsertAdapterConfig() {}

export async function deleteAdapterConfig() {}

export function normalizeAdapterConfig() {}

export function resolveAdapterExecutionConfig() {}
