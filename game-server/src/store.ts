/**
 * Storage layer.
 *
 * D1 has no interactive multi-statement transaction through the Worker binding, so every
 * write is a compare-and-swap on `version`:
 *
 *   UPDATE state SET json = ?, version = ?, updated_at = ? WHERE kind = ? AND version = ?
 *
 * `changes === 0` means another isolate won the race; the caller keeps its read and does not
 * write, so a board can never be half-updated or silently overwritten.
 */

export interface StateRow {
  json: string;
  version: number;
}

export interface StoreLike {
  read(kind: string): Promise<StateRow | null>;
  readMany(kinds: string[]): Promise<Map<string, StateRow>>;
  /** INSERT OR IGNORE; true when this call created the row. */
  insert(kind: string, json: string, version: number): Promise<boolean>;
  /** UPDATE ... WHERE version = expected; true when this call won. */
  cas(kind: string, json: string, version: number, expected: number): Promise<boolean>;
}

export class D1Store implements StoreLike {
  constructor(private db: D1Database, private now: () => number = () => Date.now()) {}

  async read(kind: string): Promise<StateRow | null> {
    const row = await this.db
      .prepare("SELECT json, version FROM state WHERE kind = ?")
      .bind(kind)
      .first<StateRow>();
    return row && typeof row.json === "string" ? row : null;
  }

  async readMany(kinds: string[]): Promise<Map<string, StateRow>> {
    const out = new Map<string, StateRow>();
    if (kinds.length === 0) return out;
    const placeholders = kinds.map(() => "?").join(",");
    const res = await this.db
      .prepare(`SELECT kind, json, version FROM state WHERE kind IN (${placeholders})`)
      .bind(...kinds)
      .all<{ kind: string; json: string; version: number }>();
    for (const row of res.results ?? []) {
      if (row && typeof row.json === "string") out.set(row.kind, { json: row.json, version: row.version });
    }
    return out;
  }

  async insert(kind: string, json: string, version: number): Promise<boolean> {
    const res = await this.db
      .prepare("INSERT OR IGNORE INTO state (kind, json, version, updated_at) VALUES (?, ?, ?, ?)")
      .bind(kind, json, version, this.now())
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async cas(kind: string, json: string, version: number, expected: number): Promise<boolean> {
    const res = await this.db
      .prepare("UPDATE state SET json = ?, version = ?, updated_at = ? WHERE kind = ? AND version = ?")
      .bind(json, version, this.now(), kind, expected)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }
}

/** Used by unit tests and by the Worker when no D1 binding is configured (read-only demo). */
export class MemoryStore implements StoreLike {
  private rows = new Map<string, StateRow>();

  constructor(seed?: Record<string, { json: string; version: number }>) {
    if (seed) {
      for (const [kind, row] of Object.entries(seed)) this.rows.set(kind, { ...row });
    }
  }

  async read(kind: string): Promise<StateRow | null> {
    const row = this.rows.get(kind);
    return row ? { ...row } : null;
  }

  async readMany(kinds: string[]): Promise<Map<string, StateRow>> {
    const out = new Map<string, StateRow>();
    for (const kind of kinds) {
      const row = this.rows.get(kind);
      if (row) out.set(kind, { ...row });
    }
    return out;
  }

  async insert(kind: string, json: string, version: number): Promise<boolean> {
    if (this.rows.has(kind)) return false;
    this.rows.set(kind, { json, version });
    return true;
  }

  async cas(kind: string, json: string, version: number, expected: number): Promise<boolean> {
    const row = this.rows.get(kind);
    if (!row || row.version !== expected) return false;
    this.rows.set(kind, { json, version });
    return true;
  }
}
