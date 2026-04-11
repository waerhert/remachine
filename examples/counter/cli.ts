import repl from 'repl';
import { main } from './main.js';

const { app, machine, recorder } = main();

console.log(`
  Counter Machine — interactive explorer
  =======================================

  Available objects:
    app       - the wrapped app instance (call methods, read state)
    machine   - the Machine instance (start, stop, snapshots)
    recorder  - the MemoryRecorder (browse snapshots)

  Try these commands:
    await app.increment(5)
    app.state
    await app.decrement(2)
    app.state
    await app.multiply(3)
    await app.reset()
    await recorder.getSnapshots()
    await machine.createSnapshot()

  Tip: use DEBUG=remachine:* for verbose logs
`);

const server = repl.start({
  prompt: 'counter > ',
  useGlobal: true,
});

server.context.app = app;
server.context.machine = machine;
server.context.recorder = recorder;
