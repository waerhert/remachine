import { Action, ActionDispatcher, ActionWithoutId, Reader, Writer } from '../core/types.js';
import { LogClass } from '../core/utils.js';

let actionCounter = 0;

/**
 * A local reader/writer pair that forms a loopback:
 * LocalWriter sends actions directly to LocalReader's dispatcher,
 * so state mutations happen immediately without external storage.
 *
 * Usage:
 *   const reader = new LocalReader();
 *   const writer = new LocalWriter(reader);
 *   const machine = new Machine(MyApp, reader, writer);
 */

@LogClass()
export class LocalReader implements Reader {
  private actionDispatcher!: ActionDispatcher;

  initialize(actionDispatcher: ActionDispatcher): void {
    this.actionDispatcher = actionDispatcher;
  }

  dispatch(action: Action): void {
    this.actionDispatcher(action, { driver: 'local' }, false);
  }

  start(): void {}
  stop(): void {}
  fetch(): void {}
}

@LogClass()
export class LocalWriter implements Writer {
  private reader: LocalReader;

  constructor(reader: LocalReader) {
    this.reader = reader;
  }

  async write(action: ActionWithoutId): Promise<void> {
    const fullAction: Action = {
      ...action,
      id: String(++actionCounter),
    };
    this.reader.dispatch(fullAction);
  }

  handleError(error: any): void {
    console.error('LocalWriter error:', error);
  }
}
