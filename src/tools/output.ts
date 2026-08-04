export function truncateUtf8(
  value: string,
  maxBytes: number,
): { text: string; truncated: boolean; originalBytes: number } {
  const originalBytes = Buffer.byteLength(value, "utf8");
  if (originalBytes <= maxBytes) {
    return { text: value, truncated: false, originalBytes };
  }

  const buffer = Buffer.from(value, "utf8");
  const suffix = "\n...[salida truncada por Orqent]";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  const limit = Math.max(0, maxBytes - suffixBytes);

  return {
    text: buffer.subarray(0, limit).toString("utf8") + suffix,
    truncated: true,
    originalBytes,
  };
}
