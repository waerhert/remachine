import { Machine, LocalReader, LocalWriter, MemoryRecorder } from '../../src/index.js';
import { Counter } from './counter.js';

export function main() {
  const recorder = new MemoryRecorder();
  const reader = new LocalReader();
  const writer = new LocalWriter(reader);

  const machine = new Machine(
    Counter,
    reader,
    writer,
    recorder,
  );

  const app = machine.getInstance();

  return { machine, app, recorder };
}
