import { writeFileSync, existsSync, readFileSync } from 'fs';
import { Recorder, Snapshot } from '../core/types.js';
import { LogClass } from '../core/utils.js';

/**
 * This recorder will
 * - store auto snapshots in memory after every dispatch (for time travel debugging)
 * - persist a snapshot to disk when explicitly instructed to do so via createSnapshot()
 *
 */
@LogClass()
export class FileRecorder implements Recorder {
  private snapshots: Snapshot[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async afterDispatch(snapshot: Snapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async getSnapshots(): Promise<Snapshot[]> {
    return this.snapshots;
  }

  async createSnapshot(snapshot: Snapshot): Promise<void> {
    // Look at snapshot.action.id if we want to save snapshots according to their id

    const data = JSON.stringify(snapshot, null, 2); // 2nd and 3rd args for pretty printing
    writeFileSync(this.filePath, data, 'utf8');
  }

  async loadSnapshot(id?: string | undefined): Promise<Snapshot | null> {
    if (id) {
      // Check if we happen to have this in memory
      return this.snapshots.find((s) => s.action?.id === id) || null;
    }

    // else just fetch what we have from file
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, 'utf8');
        return JSON.parse(data) as Snapshot;
      }
      return null;
    } catch (err) {
      console.error('Error reading the snapshot file:', err);
      throw err;
    }
  }
}
