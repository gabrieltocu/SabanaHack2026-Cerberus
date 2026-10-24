export interface Versioned<T> {
  value: T;
  version: number;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<Versioned<T> | null>;
  /** `get` of several keys in one round trip, in the order given (`null` where one is missing). */
  getMany<T>(keys: string[]): Promise<(Versioned<T> | null)[]>;
  /**
   * Writes only if current version === expectedVersion (0 = must not exist). Returns new version or
   * null on conflict. `undefined` is not a storable value: throws `INVALID_VALUE`.
   */
  compareAndSet<T>(key: string, expectedVersion: number, value: T): Promise<number | null>;
  /** Throws `INVALID_PREFIX` on an empty prefix. */
  list<T>(prefix: string): Promise<({ key: string } & Versioned<T>)[]>;
  /**
   * Resets the key, including its version (ABA: a later CAS with 0 succeeds and an old reader's
   * version can match again). Never use it on entities guarded by CAS; it is for `reset` only.
   */
  delete(key: string): Promise<void>;
  /** Atomic counter with TTL in seconds (rate limiting). */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Throws `INVALID_PREFIX` on an empty prefix (it would wipe the whole store). */
  clear(prefix: string): Promise<void>;
}

/** Stable, secret-free rejection of an argument no adapter can store or match safely. */
export class StoreArgumentError extends Error {
  constructor(readonly code: 'INVALID_VALUE' | 'INVALID_PREFIX') {
    super(code);
    this.name = 'StoreArgumentError';
  }
}

export function assertValue(value: unknown): void {
  if (value === undefined) throw new StoreArgumentError('INVALID_VALUE');
}

export function assertPrefix(prefix: string): void {
  if (prefix === '') throw new StoreArgumentError('INVALID_PREFIX');
}
