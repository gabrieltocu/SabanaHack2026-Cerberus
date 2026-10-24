/** Cryptographically secure random bytes. Throws instead of ever falling back to a weak source. */
export function secureRandom(bytes: number): Uint8Array {
  const c = globalThis.crypto;
  if (typeof c?.getRandomValues !== 'function') throw new Error('SECURE_RANDOM_UNAVAILABLE');
  return c.getRandomValues(new Uint8Array(bytes));
}
