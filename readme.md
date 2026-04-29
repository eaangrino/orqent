<p align="center">
  <img src="./src/assets/cover_logo.svg" alt="Logo del proyecto" width="620" />
</p>

**Orqent** is a local, controllable, and extensible agent runtime built in **TypeScript**, designed for terminal/TUI usage, with **Gemma 4** running on **Ollama** as the base model engine.

> This is not just a chatbot.
> This is not just a pretty wrapper around an LLM.
> It is the foundation for a local system with real history, tool calling, controlled execution, subagents, persistence, permissions, and automation.

## Project Status

This repository currently contains the initial runtime/TUI foundation on top of which the real Orqent will be built.

It does not yet represent the final scope of the project, but it already reflects the intended architectural direction:

- local-first
- TypeScript runtime
- local model execution through Ollama
- subagents as runtime primitives
- tools, permissions, and persistence as first-class concerns

## Goal

Orqent is intended to become a system capable of:

- conversing with real history
- deciding when to reason and when not to
- using tools / function calling
- executing external actions through its own runtime
- delegating work to subagents
- keeping persistent state and transcripts
- operating without depending on the cloud for the main workflow

## Technical Direction

The technical direction of the project is:

- **TypeScript / Node.js** as the orchestration core
- **React + Ink** for the TUI
- **Ollama** as the local model runtime
- **Gemma 4** as the base engine for conversation, controlled reasoning, tool selection, and coordination
- **Python** only as an auxiliary layer for vision, OCR, audio, embeddings, or other specialized ML components when it provides a real advantage over Node

## Architectural Principles

- **Local-first**
- **Registry-first**
- **Runtime-driven**
- **Explicit permissions**
- **Real persistence**
- **Agent isolation**
- **Extensibility through tools and MCP**

## What This Is Not

Orqent does not assume that the model “magically does everything”.

The model does not execute actions by itself.
The runtime decides:

- which tools exist
- which tools are allowed
- what gets validated
- what gets executed
- what gets persisted
- what goes back into context

Subagents are not just roleplay prompts. They are runtime instances with their own definition, isolated context, task state, transcript, permissions, and lifecycle.

## High-Level Roadmap

- local runtime foundation
- conversation + tool loop
- session and state persistence
- tool permission and validation system
- agent registry
- subagent creation and execution
- MCP integration
- memory and context recovery
- local automation focused on developer workflows

## License

The source code in this repository is licensed under **Apache-2.0**.

See `LICENSE`.

## Name and Branding

**Orqent** is the project name and brand identity.

The source code license **does not grant permission to use the name “Orqent”, its branding, visual identity, or logos** for derived projects, public distributions, commercialized forks, or products that may create confusion about origin, affiliation, or authorship.

If you fork this project, use a different name.

## Author

Created and maintained by **eaangrino**.
