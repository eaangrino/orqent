# runtime

Responsibility:

- Conversation loop.
- Turn execution.
- Model -> tool -> result -> model orchestration.
- Streaming handling.
- Context policy.
- Cancellation, errors, and retries.
- Future subagent coordination.

Must not contain:

- Ink components.
- UI details.
- Concrete tool implementations.
- Provider-specific model code.
