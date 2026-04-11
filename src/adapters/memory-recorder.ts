import { Recorder, Snapshot } from '../core/types.js';
import { LogClass } from '../core/utils.js';

/**
 * This recorder will
 * - store auto-snapshots (afterDispatch) in memory after every dispatch (for time traveling)
 * - store manual snapshots in memory
 *
 * @category Machine
 */
@LogClass()
export class MemoryRecorder implements Recorder {
  private autoSnaps: Snapshot[] = [];
  private manualSnaps: Snapshot[] = [];

  async afterDispatch(snapshot: Snapshot): Promise<void> {
    this.autoSnaps.push(snapshot);
  }

  async getSnapshots(): Promise<Snapshot[]> {
    return this.autoSnaps;
  }

  async createSnapshot(snapshot: Snapshot): Promise<void> {
    // We push them to a different array so we don't interfere with any timetraveling sequence in the autoSnap array
    this.manualSnaps.push(snapshot);
  }

  async loadSnapshot(id?: string | undefined): Promise<Snapshot | null> {
    if (id) {
      return (
        this.autoSnaps.find((s) => s.action?.id === id) || this.manualSnaps.find((s) => s.action?.id === id) || null
      );
    }

    return this.autoSnaps[this.autoSnaps.length - 1] || this.manualSnaps[this.manualSnaps.length - 1] || null;
  }
}
