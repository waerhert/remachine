import { Reader, ActionDispatcher, Writer } from '../core/types.js';
import { LogClass } from '../core/utils.js';

/**
 * A reader that does nothing.
 *
 * This class represents a reader that performs no specific actions when initialized,
 * started, or stopped. It is often used as a placeholder or for testing purposes.
 *
 * @category Machine
 */
@LogClass()
export class NoopReader implements Reader {
  /**
   * Initializes the NoopReader.
   *
   * @param _actionDispatcher - A function to dispatch actions (not used in this implementation).
   */
  initialize(_actionDispatcher: ActionDispatcher): void {
    // This method does nothing in this implementation.
  }

  /**
   * Starts the NoopReader.
   *
   * @param _lastActionId - An optional last action identifier (not used in this implementation).
   */
  start(_lastActionId?: string): void {
    // This method does nothing in this implementation.
  }

  /**
   * Stops the NoopReader.
   */
  stop(): void {
    // This method does nothing in this implementation.
  }

  fetch(): void {}
}

/**
 * A mock implementation of the Writer interface for testing purposes.
 * This writer performs no real actions but can be used to simulate behaviors.
 *
 */
export class NoopWriter implements Writer {
  /**
   * A mock implementation of the write method.
   * Does not perform any write actions.
   *
   * @param _data - The data that would normally be written.
   * @returns A promise that resolves immediately.
   */
  async write(_data: any): Promise<void> {
    // Do nothing.
  }

  /**
   * Handles errors by logging them.
   * In a real-world scenario, this method might handle or rectify errors.
   *
   * @param error - The error to handle.
   */
  handleError(error: any): void {
    // Log the error or do nothing.
    console.log('DummyWriter received an error:', error);
  }

  /**
   * Fetches a mock status for the provided dataId.
   *
   * @param dataId - The identifier for the data whose status is being fetched.
   * @returns A promise that resolves with a dummy status message.
   */
  async fetchWriteStatus(dataId: string): Promise<string> {
    // Return a default status or whatever makes sense for your testing.
    return 'Dummy status for ' + dataId;
  }
}
