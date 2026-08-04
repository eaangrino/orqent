export const HELP_TEXT = `
Orqent 2.0.1 — OpenAI SDK + Ollama Responses API

Uso:
  pnpm dev [--] [opciones]
  orqent [opciones]

Opciones:
  -m, --model <modelo>       Modelo de Ollama (default: gemma4:e4b)
      --base-url <url>       Endpoint OpenAI compatible (default: http://127.0.0.1:11434/v1)
      --api-key <key>        API key; Ollama local ignora el valor (default: ollama)
  -C, --cwd <ruta>           Workspace permitido
      --data-dir <ruta>      Directorio de sesiones
      --permission <modo>    ask | auto | read-only
  -s, --session <id>         Reanuda una sesión
  -p, --once <prompt>        Ejecuta un prompt y termina
      --debug                Logs técnicos a stderr
  -h, --help                 Ayuda
  -v, --version              Versión

Comandos interactivos:
  /help
  /tools
  /session
  /new
  /clear
  /model <nombre>
  /permission <ask|auto|read-only>
  /exit
`;
