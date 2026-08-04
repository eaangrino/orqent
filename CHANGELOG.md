# Changelog

## 2.0.1 — 2026-08-04

- Corrige la carga de tipos de Node en TypeScript.
- Acepta Node.js 24.x sin exigir una versión patch específica.
- Evita que configuraciones heredadas instalen solo dependencias de producción.
- Acepta argumentos con y sin el separador `--` de pnpm/npm.
- Corrige el glob del ejecutor de pruebas.
- Usa `toResponseInputItems(...)` para continuar el historial del Responses API.
- Añade pruebas del parser y una prueba HTTP real contra `/v1/responses`.
- Sincroniza la versión del CLI y la documentación.
