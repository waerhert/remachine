import pg from 'pg';
import { Action, ActionDispatcher, ActionWithoutId, Reader, Recorder, Snapshot, Writer } from '../core/types.js';
import { LogClass } from '../core/utils.js';

export interface PostgresAdapterOptions {
  /** Postgres connection config or connection string */
  connection: pg.PoolConfig | string;
  /**
   * Required unique namespace that determines table and channel names.
   * Table will be `remachine_{namespace}_actions`, channel `remachine_{namespace}_notify`.
   * Must be a valid SQL identifier fragment (lowercase alphanumeric + underscores).
   */
  namespace: string;
  /** Polling interval in ms when using fetch() mode (default: 1000) */
  pollInterval?: number;
}

function validateNamespace(ns: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(ns)) {
    throw new Error(
      `Invalid namespace "${ns}": must start with a lowercase letter and contain only lowercase alphanumeric characters and underscores.`,
    );
  }
}

function tableFromNamespace(ns: string): string {
  return `remachine_${ns}_actions`;
}

function channelFromNamespace(ns: string): string {
  return `remachine_${ns}_notify`;
}

/**
 * Creates the actions table and notification trigger if they don't exist.
 */
export async function setupPostgresSchema(pool: pg.Pool, table: string, channel: string) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id        BIGSERIAL PRIMARY KEY,
      f         TEXT NOT NULL,
      args      JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table}_snapshots (
      id         BIGSERIAL PRIMARY KEY,
      action_id  TEXT,
      state      JSONB NOT NULL,
      context    JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create a trigger function that notifies on new inserts
  await pool.query(`
    CREATE OR REPLACE FUNCTION ${table}_notify() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('${channel}', NEW.id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach trigger (drop first to avoid duplicates)
  await pool.query(`
    DROP TRIGGER IF EXISTS ${table}_notify_trigger ON ${table};
    CREATE TRIGGER ${table}_notify_trigger
      AFTER INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${table}_notify();
  `);
}

/**
 * Reads actions from a Postgres table.
 *
 * Supports two modes:
 * - start() — realtime via LISTEN/NOTIFY
 * - fetch() — manual polling
 */
@LogClass()
export class PostgresReader implements Reader {
  private pool: pg.Pool;
  private table: string;
  private channel: string;
  private actionDispatcher!: ActionDispatcher;
  private listenClient?: pg.PoolClient;
  private stopped = false;

  constructor(pool: pg.Pool, options: { table: string; channel: string }) {
    this.pool = pool;
    this.table = options.table;
    this.channel = options.channel;
  }

  initialize(actionDispatcher: ActionDispatcher): void {
    this.actionDispatcher = actionDispatcher;
  }

  /**
   * Directly dispatches an action through the Machine's queue.
   * Used by PostgresWriter for loopback.
   */
  dispatch(action: Action): void {
    this.actionDispatcher(action, { driver: 'postgres' }, false);
  }

  /**
   * Realtime mode: uses LISTEN/NOTIFY.
   * Fetches any missed actions first (since lastActionId), then listens for new inserts.
   */
  async start(lastActionId?: string): Promise<void> {
    this.stopped = false;

    // First, catch up on any actions we missed
    await this.fetchActionsSince(lastActionId, true);

    // Then start listening for new ones
    this.listenClient = await this.pool.connect();
    await this.listenClient.query(`LISTEN ${this.channel}`);

    this.listenClient.on('notification', async (msg) => {
      if (this.stopped) return;
      // Notification payload is the new action's id — fetch it
      if (msg.payload) {
        await this.fetchActionsSince(undefined, false, msg.payload);
      }
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.listenClient) {
      this.listenClient.query(`UNLISTEN ${this.channel}`).catch(() => {});
      this.listenClient.release();
      this.listenClient = undefined;
    }
  }

  /**
   * Polling mode: fetches all actions after lastActionId.
   */
  async fetch(lastActionId?: string): Promise<void> {
    await this.fetchActionsSince(lastActionId, false);
  }

  /**
   * Fetches actions from postgres and dispatches them.
   * If specificId is provided, fetches only that single action.
   */
  private async fetchActionsSince(lastActionId?: string, isResynchronizing = false, specificId?: string): Promise<void> {
    let result: pg.QueryResult;

    if (specificId) {
      result = await this.pool.query(
        `SELECT id, f, args FROM ${this.table} WHERE id = $1`,
        [specificId],
      );
    } else if (lastActionId) {
      result = await this.pool.query(
        `SELECT id, f, args FROM ${this.table} WHERE id > $1 ORDER BY id ASC`,
        [lastActionId],
      );
    } else {
      result = await this.pool.query(
        `SELECT id, f, args FROM ${this.table} ORDER BY id ASC`,
      );
    }

    for (const row of result.rows) {
      if (this.stopped) break;
      const action: Action = {
        id: String(row.id),
        f: row.f,
        args: row.args,
      };
      this.actionDispatcher(action, { driver: 'postgres', row }, isResynchronizing);
    }
  }
}

/**
 * Writes actions to a Postgres table.
 * The action ID is assigned by Postgres (BIGSERIAL).
 *
 * When paired with a PostgresReader, the writer dispatches the action
 * back through the reader immediately after INSERT (loopback), so
 * state updates without needing machine.start().
 *
 * For multi-instance setups, other instances pick up the action
 * via LISTEN/NOTIFY through their own reader.
 */
@LogClass()
export class PostgresWriter implements Writer {
  private pool: pg.Pool;
  private table: string;
  private reader?: PostgresReader;

  constructor(pool: pg.Pool, options: { table: string; reader?: PostgresReader }) {
    this.pool = pool;
    this.table = options.table;
    this.reader = options?.reader;
  }

  async write(action: ActionWithoutId): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO ${this.table} (f, args) VALUES ($1, $2) RETURNING id`,
      [action.f, JSON.stringify(action.args)],
    );

    // Loopback: dispatch immediately through the reader so state updates
    if (this.reader) {
      const fullAction: Action = {
        ...action,
        id: String(result.rows[0].id),
      };
      this.reader.dispatch(fullAction);
    }
  }

  handleError(error: any): void {
    console.error('PostgresWriter error:', error);
  }
}

/**
 * Stores snapshots in Postgres.
 *
 * - afterDispatch: keeps latest snapshot in memory (fast access), does NOT write to DB on every dispatch
 * - createSnapshot: persists a snapshot to the snapshots table
 * - loadSnapshot: loads from DB (by action_id or latest)
 * - getSnapshots: returns in-memory auto-snapshots (same as MemoryRecorder)
 */
@LogClass()
export class PostgresRecorder implements Recorder {
  private pool: pg.Pool;
  private table: string;
  private autoSnaps: Snapshot[] = [];

  constructor(pool: pg.Pool, options: { table: string }) {
    this.pool = pool;
    this.table = options.table + '_snapshots';
  }

  async afterDispatch(snapshot: Snapshot): Promise<void> {
    this.autoSnaps.push(snapshot);
  }

  async getSnapshots(): Promise<Snapshot[]> {
    return this.autoSnaps;
  }

  async createSnapshot(snapshot: Snapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (action_id, state, context) VALUES ($1, $2, $3)`,
      [
        snapshot.action?.id ?? null,
        JSON.stringify(snapshot.state),
        snapshot.ctx ? JSON.stringify(snapshot.ctx) : null,
      ],
    );
  }

  async loadSnapshot(id?: string): Promise<Snapshot | null> {
    let result: pg.QueryResult;

    if (id) {
      // Try in-memory first
      const memSnap = this.autoSnaps.find((s) => s.action?.id === id);
      if (memSnap) return memSnap;

      result = await this.pool.query(
        `SELECT action_id, state, context FROM ${this.table} WHERE action_id = $1 ORDER BY id DESC LIMIT 1`,
        [id],
      );
    } else {
      result = await this.pool.query(
        `SELECT action_id, state, context FROM ${this.table} ORDER BY id DESC LIMIT 1`,
      );
    }

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      action: row.action_id ? { id: row.action_id, f: '', args: [] } : undefined,
      state: row.state,
      ctx: row.context ?? undefined,
    };
  }
}

/**
 * Convenience factory: creates a Pool, runs schema setup, returns reader + writer + recorder + pool.
 */
export async function createPostgresAdapter(options: PostgresAdapterOptions) {
  const poolConfig = typeof options.connection === 'string'
    ? { connectionString: options.connection }
    : options.connection;

  const pool = new pg.Pool(poolConfig);
  validateNamespace(options.namespace);
  const table = tableFromNamespace(options.namespace);
  const channel = channelFromNamespace(options.namespace);

  await setupPostgresSchema(pool, table, channel);

  const reader = new PostgresReader(pool, { table, channel });
  const writer = new PostgresWriter(pool, { table, reader });
  const recorder = new PostgresRecorder(pool, { table });

  return { reader, writer, recorder, pool };
}
