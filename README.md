# Orqent 2.0.1

Reescritura del agente local con **Node.js 24**, **pnpm** y el **SDK oficial de OpenAI**, apuntando al endpoint compatible con OpenAI de Ollama.

Esta versión elimina por completo:

- la dependencia JavaScript `ollama`;
- el protocolo XML inventado para tool calls;
- el parser manual de etiquetas `<orqent_tool_call>`;
- la reinyección de resultados como mensajes de usuario comunes;
- el registro prematuro de subsistemas experimentales que contaminaba el contexto.

## Qué usa realmente

Dependencias directas fijadas:

- Node.js `24.x`;
- pnpm `11.20.0`;
- `openai@7.4.0`;
- TypeScript `7.0.2`;
- `tsx@4.23.5`;
- `@types/node@24.13.2`.

El runtime usa:

- `client.responses.create(...)`;
- tools estándar de Responses API con `type: "function"`;
- items `function_call` y `function_call_output` enlazados por `call_id`;
- `toResponseInputItems(...)` del SDK para normalizar la salida antes de incorporarla al siguiente turno;
- historial stateless gestionado por Orqent, sin depender de `previous_response_id`.

No existe ningún tipo de tool ficticio. Los nombres `fs_read`, `console_exec`, etc. son funciones locales normales publicadas al modelo mediante el contrato oficial de function tools.

## Invariante que evita el olvido de tools

En **cada ronda** Orqent:

1. envía el catálogo completo de tools;
2. normaliza y conserva la salida completa del modelo, en orden;
3. ejecuta todos los items `function_call`;
4. agrega un `function_call_output` con el mismo `call_id`;
5. vuelve a enviar el historial completo junto al mismo catálogo.

No se conservan solamente los mensajes de texto. Hacerlo elimina el estado del function calling y rompe la continuidad del agente.

## Tools incluidas

| Tool | Riesgo | Función |
|---|---:|---|
| `console_exec` | execute | Ejecuta comandos con el workspace como `cwd` |
| `fs_read` | read | Lee archivos con rango de líneas |
| `fs_list` | read | Lista el árbol del proyecto |
| `fs_search` | read | Busca texto literal en archivos |
| `fs_write` | write | Crea o sobrescribe archivos |
| `fs_replace` | write | Hace reemplazos exactos y verificables |
| `git_status` | read | Consulta el estado Git |
| `git_diff` | read | Consulta el diff Git |
| `git_log` | read | Consulta el historial reciente |

Las tools de archivos restringen sus rutas al workspace, incluyendo comprobaciones contra escapes mediante `..` y enlaces simbólicos. Las tools mutantes requieren confirmación en modo `ask`.

`console_exec` solo fija su `cwd`: **no es un sandbox del sistema operativo**. El proceso conserva los permisos del usuario que ejecuta Orqent y un comando de shell puede intentar acceder fuera del workspace.

## Requisitos

- Cualquier versión estable de Node.js `24.x`.
- pnpm `11.20.0`.
- Ollama con `/v1/responses` y function calling.
- Un modelo de Ollama que soporte tools.

## Extracción limpia

No descomprima esta entrega encima de la versión anterior ni dentro de otro workspace de pnpm. Hágalo en una carpeta nueva para evitar que un `pnpm-lock.yaml`, `.npmrc` o `node_modules` heredado altere la instalación.

```bash
mkdir -p ~/orqent-2.0.1
unzip orqent-openai-sdk-v2.0.1-node24-pnpm.zip -d ~/orqent-2.0.1
cd ~/orqent-2.0.1/orqent-openai-sdk-v2.0.1
```

## Instalación

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
pnpm install
pnpm test
```

## Preparar Ollama

Ejemplo con Gemma:

```bash
ollama pull gemma4:e4b
```

Compruebe que Ollama expone el endpoint compatible:

```bash
curl http://127.0.0.1:11434/v1/models
```

## Configuración

```bash
cp .env.example .env
```

El CLI lee variables de entorno del proceso. Node no carga `.env` automáticamente; puede exportarlas desde el shell:

```bash
set -a
source .env
set +a
```

Variables principales:

```bash
ORQENT_BASE_URL=http://127.0.0.1:11434/v1
ORQENT_API_KEY=ollama
ORQENT_MODEL=gemma4:e4b
ORQENT_PERMISSION_MODE=ask
```

## Ejecutar

Modo interactivo:

```bash
pnpm dev
```

Una sola instrucción, forma recomendada:

```bash
pnpm dev --once "lista las tools disponibles y lee package.json"
```

También se acepta el separador explícito utilizado por npm/pnpm:

```bash
pnpm dev -- --once "lista las tools disponibles y lee package.json"
```

Con otro modelo:

```bash
pnpm dev --model qwen3:8b
```

Reanudar sesión:

```bash
pnpm dev --session session_...
```

## Comandos interactivos

```text
/help
/tools
/session
/new
/clear
/model <nombre>
/permission <ask|auto|read-only>
/exit
```

## Permisos

### `ask`

Las lecturas se ejecutan directamente. Escrituras y comandos solicitan confirmación.

### `auto`

Permite todas las tools sin confirmación. Debido a que `console_exec` no es un sandbox, este modo solo debe utilizarse en contenedores, máquinas virtuales o entornos desechables y controlados.

### `read-only`

Bloquea `console_exec`, `fs_write` y `fs_replace`.

## Tests

```bash
pnpm test
```

Las pruebas comprueban:

- el catálogo completo de tools se reenvía en cada ronda;
- cada `function_call` conserva su `call_id` y recibe su `function_call_output`;
- varias llamadas en la misma respuesta mantienen su orden;
- argumentos JSON inválidos generan un resultado serializable;
- `toResponseInputItems(...)` se usa para continuar el historial;
- las sesiones conservan los items completos de Responses API;
- las rutas no pueden escapar del workspace;
- `read-only` bloquea mutaciones;
- el parser acepta tanto `--once` como `-- --once`;
- el cliente realiza un POST real a `/v1/responses` en una prueba HTTP local.

## Docker

El contenedor ejecuta Orqent, pero Ollama normalmente vive en el host. En Linux puede ser necesario exponer la dirección del host explícitamente.

```bash
docker build -t orqent .
docker run --rm -it \
  --add-host=host.docker.internal:host-gateway \
  -e ORQENT_BASE_URL=http://host.docker.internal:11434/v1 \
  -e ORQENT_MODEL=gemma4:e4b \
  -v "$PWD:/workspace" \
  orqent --cwd /workspace
```

## Alcance deliberado

Esta base no incluye todavía MCP, skills, subagentes ni decenas de wrappers. Añadirlos antes de estabilizar el loop fue parte del problema anterior.

Las capacidades nuevas deben registrarse en `ToolRegistry` y cumplir estas reglas:

- schema estricto;
- handler real;
- permisos explícitos;
- resultado serializable;
- test de ida y vuelta;
- catálogo reenviado en todas las rondas.

## Estructura

```text
src/
  agent/       loop de Responses API y protocolo
  cli/         REPL y comandos
  openai/      cliente oficial OpenAI
  security/    permisos y confinamiento de rutas
  session/     persistencia stateless del historial completo
  tools/       registry y tools locales
```
