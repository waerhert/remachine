import { ActionDispatcher, Reader } from '../core/types.js';

/**
 * A class that dispatches actions at regular intervals.
 *
 */
export class IntervalReader implements Reader {
  private actionDispatcher!: ActionDispatcher;
  private intervalId?: NodeJS.Timeout;
  private action: any;
  private intervalInSeconds: number;

  /**
   * Constructs a new interval reader.
   *
   * @param action - The action that should be dispatched on each interval.
   * @param intervalInSeconds - The interval duration in seconds.
   */
  constructor(action: any, intervalInSeconds: number) {
    this.action = action;
    this.intervalInSeconds = intervalInSeconds;
  }

  /**
   * Initializes the reader with an action dispatcher.
   *
   * @param actionDispatcher - The function to be called when dispatching action.
   */
  initialize(actionDispatcher: ActionDispatcher): void {
    this.actionDispatcher = actionDispatcher;
  }

  /**
   * Starts the action dispatch at the specified intervals.
   */
  start(): void {
    this.intervalId = setInterval(() => {
      this.actionDispatcher(this.action, { driver: 'intervalDriver ' }, false);
    }, 1000 * this.intervalInSeconds); // Example: every 1 second
  }

  /**
   * Stops the interval-driven action dispatch.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  fetch(): void {}
}
