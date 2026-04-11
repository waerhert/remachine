/**
 * Represents an action.
 * Actions are being dispatched by Readers through the dispatchAction function.
 * Actions determine which function gets called with which arguments.
 */
export interface Action {
  /** A unique ID of the Action */
  id: string;
  /** The action name/type/function */
  f: string;
  /** The action arguments */
  args: any[];
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ActionWithOptionalId = Optional<Action, 'id'>;
export type ActionWithoutId = Omit<Action, 'id'>;

/**
 * Represents the context in which an action is being processed.
 */
export type Context = {
  /** Additional context set by the Reader */
  reader: any;

  /** A flag indicating if the action is part of a resynchronization process. */
  isResynchronizing: boolean;

  /** Dynamic properties that might be added to the context. */
  [x: string]: any;
};

/**
 * Middleware functions are designed to interpose on method calls, allowing preprocessing and postprocessing.
 */
export type MiddlewareFunction = (
  /** The context in which the middleware operates. */
  ctx: Context,
  /** Arguments provided to the original method. */
  args: any[],
  /** The next function in the middleware chain. */
  next: (newArgs: any[]) => Promise<any>,
) => Promise<void>;

/**
 * Defines the structure for the state of the app.
 */
export interface AppState {
  [key: string]: any;
}

export type AppQueries = Record<string, (arg: any) => any>;

/**
 * Represents a full application, combining both its state and methods.
 */
export abstract class App {
  abstract state: AppState;
  /**
   * queries can be used to define read-only queries on your state.
   *
   * queries must be defined as single-argument functions, where the argument is an object
   *
   * for example:
   *
   * queries = {object
   *  getUserById: ({ id: string}) => { return this.state.users[id] }
   * }
   */
  queries?: AppQueries;
  context?: any;
}

export type ActionDispatcher = (action: Action, additionalContext: any, isResynchronizing: boolean) => void;
/**
 * Interface representing the capabilities of a Reader, responsible for reading and dispatching actions.
 */
export interface Reader {
  /** Initializes the reader and sets up the action dispatcher. */
  initialize(actionDispatcher: ActionDispatcher): void;

  /** Starts the reader's action dispatching process. (realtime) */
  start(lastActionId?: string): void;

  /** Stops the reader's action dispatching process. */
  stop(): void;

  /**
   * Fetches the latest events to dispatch them to the machine (you have to keep calling this regularly to stay updated).
   * Mixed usage of start() and fetch() is not advised.
   */
  fetch(lastActionId?: string): void;
}

/**
 * Interface defining the operations of a Writer, responsible for writing action to storage.
 */
export interface Writer {
  /** Writes action to the storage. */
  write(action: ActionWithoutId): Promise<void>;

  /** Handles errors or rejections that occur during the write process. */
  handleError(error: any): void;

  /**
   * (Optional) Fetches the confirmation or status of the written data.
   * Useful for ensuring data integrity or completion.
   */
  fetchWriteStatus?(dataId: string): Promise<string>;
}

/**
 * Type utility that omits the first argument from a function type signature.
 */
export type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => Promise<R> : never;

/**
 * Represents a type that has had its methods wrapped, typically to omit the first argument.
 */
export type WrappedType<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? OmitFirstArg<T[K]> : T[K];
};

/** Represents a snapshot of the application's state at a given point in time. */
export interface Snapshot {
  /** The resulting state of the application after the action was dispatched. */
  state: AppState;

  /**
   * The action that was dispatched, leading to the current state.
   * If action is undefined, it means the state in the Snapshot is the initial state
   * because no action was executed to reach this state
   */
  action: Action | undefined;

  /**
   * The context in which the action was dispatched. This can contain
   * additional information or metadata about the current environment or situation.
   */
  ctx?: Context;
}

export interface EventHandlerMap {
  _snapshotRecorded: (snapshot: Snapshot) => void;
}

export type Events = keyof EventHandlerMap;

export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export type MachineEvents<T extends App> = Events | FunctionPropertyNames<T>;
/**
 * A recorder stores Snapshots. You can use a Recorder
 * - to timetravel through state changes
 * - to persist snapshots so that you can intialize faster later
 *
 * Recorders MUST NOT change the received Snapshot. If you need to change anything, create a deepClone first.
 */
export interface Recorder {
  /**
   * Records a snapshot. This function is called by AppEngine after EVERY state dispatch.
   * It is up to you to decide where to store this Snapshot, if at all.
   *
   * Possible use case:
   * - for quick time traveling while debugging: store it into an array in memory
   * - if you want to persist every snapshot, you may consider to implement createSnapshot() and implement record as "return createSnapshot(snapshot)"
   *
   * @param snapshot - A deepcloned snapshot
   */
  afterDispatch(snapshot: Snapshot): Promise<void>;

  /**
   * Returns all recorded snapshots.
   * @returns Array of snapshots
   */
  getSnapshots?(): Promise<Snapshot[]>;

  /**
   * Called when you explicitly call AppEngine::createSnapshot()
   * It is up to you to decide where to store this Snapshot.
   * Omit this function to disable explicit snapshot creation
   *
   * @param snapshot - A snapshot to save
   * @returns The saved snapshot
   */
  createSnapshot?(snapshot: Snapshot): Promise<void>;

  /**
   * Loads a snapshot.
   * Called by AppEngine::loadSnapshot(), which will then load this snapshot's state into your App
   * Omit this function if you do not want persistence
   *
   * @param id - Optional snapshot id, if omitted, you should return the latest snapshot
   * @returns The loaded snapshot or null
   */
  loadSnapshot?(id?: string): Promise<Snapshot | null>;
}
