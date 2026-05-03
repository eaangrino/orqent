/**
 * HTTP API adapter placeholder.
 *
 * This adapter is intentionally not implemented yet.
 * It is reserved for a future controlled HTTP client layer that lets Orqent call
 * REST/HTTP APIs without falling back to shell commands such as curl.
 *
 * Intended scope:
 * - Execute structured HTTP requests through fetch.
 * - Support GET, HEAD, OPTIONS, POST, PUT, PATCH, and DELETE.
 * - Normalize and validate URLs before execution.
 * - Allow only http:// and https:// protocols.
 * - Apply request timeouts with AbortController.
 * - Support query params, headers, JSON body, and text body.
 * - Limit response size to avoid huge tool results.
 * - Parse JSON responses when content-type indicates JSON.
 * - Return a normalized result shape with status, headers, body, duration, and truncation metadata.
 * - Redact sensitive request data before logging, especially Authorization, Cookie, Set-Cookie, X-API-Key, tokens, secrets, and bearer values.
 * - Classify GET, HEAD, and OPTIONS as read-only by default.
 * - Classify POST, PUT, PATCH, and DELETE as mutating actions that require confirmation.
 * - Integrate with Orqent's existing permission policy before being exposed as a tool.
 * - Integrate with the existing tool action audit log without leaking secrets.
 * - Add tests with mocked fetch before registering any public tool.
 *
 * Explicit non-goals for the first implementation:
 * - No OAuth flow.
 * - No browser automation.
 * - No scraping layer.
 * - No plugin marketplace integration.
 * - No API-specific clients such as GitHub, Linear, Jira, or Telegram.
 * - No automatic access to arbitrary internal/private networks without a policy decision.
 *
 * Expected future public tool:
 * - http.request
 *
 * The adapter should remain unregistered until validation, permission handling,
 * timeout behavior, response limits, and secret redaction are fully tested.
 */

export async function executeHttpRequest() { }

export function normalizeHttpMethod() { }

export function normalizeHttpUrl() { }

export function redactHttpRequestSecrets() { }

export function classifyHttpRequestRisk() { }
