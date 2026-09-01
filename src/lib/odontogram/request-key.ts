/**
 * The request key every composer form submits with.
 *
 * It is a SHA-256 of the submitted facts, not a rotating token: two byte-identical
 * submissions derive the same key, so an unchanged retry replays the stored
 * server result instead of writing a second clinical record or confirming a
 * second charge. Editing any submitted fact rotates the key, and reverting the
 * edit returns to the original one.
 */
export async function deriveClinicalRequestKey(facts: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Without Web Crypto there is no derivable key, so the submission is
    // refused rather than sent under a guessable or colliding one.
    throw new Error("secure request key unavailable");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(facts)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
