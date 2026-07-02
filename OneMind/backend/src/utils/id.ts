export function generateUuidV7Like(): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const hex = timestamp.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${uuid.slice(15)}`;
}
