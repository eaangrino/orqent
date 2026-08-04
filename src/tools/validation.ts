export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Los argumentos deben ser un objeto JSON.");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`El campo ${key} debe ser un string no vacío.`);
  }
  return value;
}

export function nullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`El campo ${key} debe ser string o null.`);
  }
  return value;
}

export function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`El campo ${key} debe ser boolean.`);
  }
  return value;
}

export function nullableInteger(
  record: Record<string, unknown>,
  key: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  const value = record[key];
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `El campo ${key} debe ser entero entre ${minimum} y ${maximum}, o null.`,
    );
  }
  return value;
}
