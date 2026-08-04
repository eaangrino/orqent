# Validación de Orqent 2.0.1

Fecha: 2026-08-04

## Correcciones frente a la entrega 2.0.0

La primera entrega no estaba validada correctamente. Los errores reportados eran reales y se corrigieron así:

1. `tsconfig.json` ahora declara `"types": ["node"]`.
2. El engine acepta toda la rama Node.js 24: `>=24.0.0 <25`.
3. `.npmrc` fuerza `production=false` para que un entorno heredado no omita las devDependencies.
4. El parser ignora el separador aislado `--`.
5. El script de tests usa `dist/test/*.test.js`; el glob anterior no encontraba archivos directamente bajo `dist/test`.
6. El historial usa `toResponseInputItems(...)` del SDK antes de continuar la conversación.
7. La versión del CLI quedó sincronizada en `2.0.1`.

## Pruebas ejecutadas

Se ejecutaron 11 pruebas y todas aprobaron:

1. reenvío del catálogo completo de tools;
2. preservación y normalización de `response.output`;
3. enlace de `function_call` y `function_call_output` por `call_id`;
4. varias tool calls en una respuesta, conservando el orden;
5. error serializable para argumentos JSON inválidos;
6. aceptación de `pnpm dev -- --once ...`;
7. aceptación de `pnpm dev --once ...`;
8. petición HTTP real del cliente a `/v1/responses`;
9. persistencia de sesiones;
10. schemas y permisos de las nueve function tools;
11. bloqueo de escapes de rutas y de mutaciones en `read-only`.

También se ejecutó un flujo completo del CLI contra un servidor HTTP local de prueba:

1. el servidor respondió con un `function_call` a `fs_read`;
2. Orqent leyó `package.json`;
3. Orqent envió un segundo POST con el `function_call_output` correcto;
4. el catálogo de nueve tools volvió a enviarse completo;
5. el CLI imprimió la respuesta final y terminó con código 0.

## Límites de la validación

El entorno de construcción no tenía acceso al registro npm ni a una instancia real de Ollama. Para compilar y probar la integración se usaron los tipos locales disponibles y un sustituto mínimo, exclusivamente de validación, para la superficie del paquete `openai`. Ese sustituto **no está incluido en el ZIP**.

Por tanto:

- sí se validaron el compilador, el loop, la serialización, el registro, las tools, el parser y el tráfico HTTP completo;
- no se validó en este entorno una instalación fresca desde npm;
- no se validó aquí una respuesta emitida por un modelo real de Ollama.

La comprobación definitiva en el equipo destino debe hacerse en una carpeta limpia:

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
pnpm install
pnpm test
pnpm dev --once "lista las tools disponibles y lee package.json"
```
