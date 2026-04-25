# tools

Responsibility:

- Base tool contract.
- Tool registry.
- Input validation.
- Tool permissions.
- Tool timeouts, retries, and errors.
- Base tools: shell, filesystem, file read/write, project search.

Must not contain:

- Ink UI.
- Full conversation loop.
- Session state.
- Ollama-specific logic.
