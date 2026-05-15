/**
 * Client-issued UUID for facility map shapes. The same id flows from
 * optimistic state into the persisted row, so it must be a valid-shaped
 * UUID v4 string. Prefers `crypto.randomUUID()` and degrades to a
 * `Math.random()` builder when it's unavailable (non-secure contexts —
 * loopback IPs over http, older webviews).
 */
export function makeNodeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-4${random().slice(1)}-8${random().slice(1)}-${random()}${random()}${random()}`;
}
