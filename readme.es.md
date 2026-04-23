# Orqent

**Orqent** es un agent runtime local, controlable y extensible, construido en **TypeScript**, orientado a terminal/TUI, con **Gemma 4** ejecutándose sobre **Ollama** como motor base del modelo.

> No es un simple chatbot.
> No es un wrapper bonito sobre un LLM.
> Es la base para un sistema local con historial real, tool calling, ejecución controlada, subagentes, persistencia, permisos y automatización.

## Estado del proyecto

Actualmente este repositorio contiene la base inicial del runtime/TUI sobre la que se construirá el Orqent real.

Todavía no representa el alcance final del proyecto, pero sí la dirección arquitectónica correcta:

- local-first
- runtime en TypeScript
- modelo local vía Ollama
- subagentes como primitivas del runtime
- tools, permisos y persistencia como piezas centrales

## Objetivo

Orqent busca construir un sistema capaz de:

- conversar con historial real
- decidir cuándo razonar y cuándo no
- usar tools / function calling
- ejecutar acciones externas mediante un runtime propio
- delegar tareas a subagentes
- mantener persistencia de estado y transcripts
- operar sin depender de la nube para el flujo principal

## Enfoque técnico

La dirección técnica del proyecto es:

- **TypeScript / Node.js** como núcleo de orquestación
- **React + Ink** para la interfaz TUI
- **Ollama** como runtime local del modelo
- **Gemma 4** como motor base para conversación, razonamiento controlado, selección de tools y coordinación
- **Python** solo como capa auxiliar para visión, OCR, audio, embeddings u otros componentes especializados cuando realmente aporte más que Node

## Principios de arquitectura

- **Local-first**
- **Registry-first**
- **Runtime-driven**
- **Permisos explícitos**
- **Persistencia real**
- **Aislamiento entre agentes**
- **Extensibilidad por tools y MCP**

## Qué no es

Orqent no asume que el modelo “hace magia”.

El modelo no ejecuta acciones por sí solo.
El runtime decide:

- qué tools existen
- cuáles están permitidas
- qué se valida
- qué se ejecuta
- qué se persiste
- qué vuelve al contexto

Los subagentes no son roleplay de prompts: son instancias con definición, contexto aislado, task state, transcript, permisos y lifecycle.

## Roadmap de alto nivel

- runtime base local
- loop de conversación + herramientas
- persistencia de sesiones y estado
- permisos y validación de tools
- registro de agentes
- creación y ejecución de subagentes
- integración MCP
- memoria y recuperación de contexto
- automatización local orientada a desarrollo

## Licencia

El código de este repositorio está licenciado bajo **Apache-2.0**.

Ver `LICENSE`.

## Nombre y branding

**Orqent** es el nombre del proyecto y su identidad de marca.

La licencia del código **no otorga permiso para usar el nombre “Orqent”, su branding, identidad visual o logos** para proyectos derivados, distribuciones públicas, forks comercializados o productos que puedan generar confusión sobre origen, afiliación o autoría.

Si haces un fork, cambia el nombre.

## Autor

Creado y mantenido por **eaangrino**.
