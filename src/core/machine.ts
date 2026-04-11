import { EventEmitter } from 'eventemitter3';
import Queue from 'p-queue';

import {
  Action,
  ActionWithoutId,
  App,
  Context,
  MachineEvents,
  MiddlewareFunction,
  Reader,
  Recorder,
  Snapshot,
  WrappedType,
  Writer,
} from './types.js';
import { deepClone, deepFreeze, LogClass, yieldToEventLoop } from './utils.js';

const _snapshot = Symbol();

export interface MachineOptions {
  emitAppEvents?: boolean; // When set to true, the machine will emit an event with the same name as your app function and send the latest snapshot
  chunkSize?: number;
  bindThisValueForCommands?: () => any,
}
/**
 * The core engine for running applications with event-driven architectures.
 * Provides mechanisms for reading and writing actions, as well as invoking app-specific methods.
 *
 * @category Machine
 */
@LogClass()
export class Machine<T extends App, R extends Reader, W extends Writer> extends EventEmitter {
  private instance: T;
  private reader: R;
  private writer: W;
  private recorder?: Recorder;
  private options: MachineOptions;
  private yieldCounter = 0;

  private [_snapshot]: Snapshot;
  private queue: Queue = new ((Queue as any).default ? (Queue as any).default : Queue)({ concurrency: 1 }); // ESM <> CommonJS hack

  /**
   * @param appClass - The class that represents the application's logic and state.
   * @param reader - The reader to read events.
   * @param writer - The writer to persist actions.
   */
  constructor(appClass: { new (): T }, reader: R, writer: W, recorder?: Recorder, options?: MachineOptions) {
    super();
    this.instance = new appClass();
    this.reader = reader;
    this.writer = writer;
    this.recorder = recorder;
    this.options = { ...{ emitAppEvents: false, chunkSize: 8 }, ...options };

    this[_snapshot] = {
      action: undefined,
      state: this.instance.state, // ! This is a reference! Not a clone! Always deepClone() when saving this somewhere else
    };

    if (this.recorder) {
      this.recorder.afterDispatch(this[_snapshot]);
    }

    this.reader.initialize(this.dispatchAction.bind(this));
  }

  on(event: MachineEvents<T>, listener: (...args: any[]) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  on(event: any, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Instructs the reader to begin dispatching events.
   * Calls the reader's start function with the latest action id if present
   *
   * @param snapshot - Resume from a snapshot. Informs the reader of the latest snapshot so that the reader can skip any actions prior to this.
   */
  public start() {
    this.reader.start(this[_snapshot].action?.id);
  }

  /**
   * Instructs the reader to stop dispatching actions.
   */
  public stop() {
    this.reader.stop();
  }

  /**
   * Instructs the reader to fetch the latest events.
   * This is different from start(), which opens a realtime websocket that drives your App continuously.
   * Do not mix the usage of start() and fetch()
   */
  public async fetch() {
    return this.reader.fetch(this[_snapshot].action?.id);
  }

  /**
   * Creates a snapshot.
   * This function will create a snapshot after an action has been fully completed.
   */
  async createSnapshot(): Promise<Snapshot> {
    if (!this.recorder) {
      throw new Error('No Recorder available. Provide a recorder to Machine via the constructor');
    }

    if (!this.recorder.createSnapshot || typeof this.recorder.createSnapshot !== 'function') {
      throw new Error('No Recorder with createSnapshot() available. Implement createSnapshot() on your Recorder');
    }

    return this.queue.add<Snapshot>(
      async () => {
        const snapshot = this[_snapshot];
        await this.recorder!.createSnapshot!(snapshot);
        return snapshot;
      },
    ) as Promise<Snapshot>;
  }

  /**
   * Loads a snapshot into the state of the App instance.
   * After calling this function, getInstance().state will equal that of the loaded snapshot
   * @param id - The Action.id of the snapshot to load
   */
  async loadSnapshot(id?: string): Promise<void> {
    if (!this.recorder?.loadSnapshot || typeof this.recorder.loadSnapshot !== 'function') {
      throw new Error(
        'No Recorder with loadSnapshot() available. Give a Recorder instance to AppEngine via the constructor and implement loadSnapshot().',
      );
    }

    const snapshot = await this.recorder.loadSnapshot(id);

    if (!snapshot) {
      return;
    }

    return this.queue.add(() => {
      (this.instance as any).state = deepClone(snapshot.state);
      this[_snapshot] = {
        action: snapshot.action,
        ctx: snapshot.ctx,
        state: this.instance.state,
      };
    });
  }

  /**
   * Gets a proxied version of the app instance where methods are wrapped
   * to automatically write actions to the action storage.
   *
   * Access to instance.state is readonly via a cloned copy
   *
   * @returns The wrapped application instance.
   */
  public getInstance(): WrappedType<T> {
    return new Proxy(this.instance, {
      get: (target: T, prop: string | symbol) => {
        if (typeof prop === 'symbol' || !(prop in target)) {
          return undefined;
        }

        if (prop === 'state') {
          // Return a cloned copy of the state, freeze is to discourage modification
          return deepFreeze(deepClone(target.state));
        }

        if (typeof (target as any)[prop] !== 'function' || prop.startsWith('_')) {
          return Reflect.get(target, prop);
        }

        // If it's a function, return a new function that calls the writer
        return async (...args: any[]) => {
          const action: ActionWithoutId = {
            f: prop,
            args,
          };

          await this.writer.write(action);
        };
      },
      set(target, prop, value) {
        if (prop === 'state') {
          throw new Error('Direct modification of state is forbidden');
        }
        return Reflect.set(target, prop, value);
      },
    }) as WrappedType<T>;
  }

  /**
   * Registers a middleware function for a specific method on the app instance.
   *
   * @returns The wrapped application instance.
   */
  public useMiddleware(methodName: keyof T, middlewareFn: MiddlewareFunction) {
    const originalMethod = this.instance[methodName];
    if (typeof originalMethod !== 'function') {
      console.warn(`No method named ${String(methodName)} found on the instance.`);
      return;
    }

    (this.instance[methodName as keyof T] as any) = async (ctx: Context, ...args: any[]) => {
      const next = (newArgs: any[]) => originalMethod.apply(this.instance, [ctx, ...newArgs]);
      return middlewareFn(ctx, args, next);
    };
  }

  /**
   * Dispatches an action to the appropriate method on the app instance.
   * Passed to a reader via the Reader.initialize function.
   * Called by a reader to dispatch actions.
   *
   * @param action - The action data.
   * @param additionalContext - Additional context data that will be accessible from ctx.reader inside methods.
   */
  private dispatchAction(action: Action, additionalContext: any, isResynchronizing: boolean): Promise<void> {
    this.yieldCounter++;
    if (this.yieldCounter % this.options.chunkSize! === 0) {
      this.queue.add(async () => {
        await yieldToEventLoop();
      });
    }
    return this.queue
      .add(async () => {
        const ctx: Context = deepFreeze<Context>({
          action,
          isResynchronizing: isResynchronizing,
          reader: additionalContext,
        });

        // Check if the method starts with an underscore (making it private).
        if (action.f.startsWith('_')) {
          throw new Error(
            `Cannot dispatch to private method ${action.f}. Methods starting with an underscore are considered private.`,
          );
        }

        if (typeof this.instance[action.f as keyof T] === 'function') {
          await (this.instance[action.f as keyof T] as any)(ctx, ...(action.args || []));
        } else {
          console.warn(`No method named ${action.f} found on the instance.`);
        }

        // Set this snapshot
        this[_snapshot] = {
          action: action,
          ctx: ctx,
          state: this.instance.state,
        };

        if (this.options.emitAppEvents) {
          const snapshot = this[_snapshot];
          this.emit(action.f, snapshot);
        }

        if (this.recorder) {
          // If recorder instance is provided, record the snapshot.
          this.recorder.afterDispatch(this[_snapshot]);
          this.emit('_snapshotRecorded', this[_snapshot]);
        }
      })
      .catch((error) => {
        console.error('Error executing method:', error);
      });
  }
}
