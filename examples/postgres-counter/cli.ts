import repl from 'repl';
import { main } from './main.js';

main().then(({ app, machine, recorder, pool }) => {
  console.log(`
  Postgres Counter Machine — interactive explorer
  ================================================

  Available objects:
    app       - the wrapped app instance (call methods, read state)
    machine   - the Machine instance (start, stop, snapshots)
    recorder  - the PostgresRecorder (browse/persist snapshots)
    pool      - the pg Pool (run raw queries)

  Try these commands:
    await app.increment(5)
    app.state
    await app.decrement(2)
    await app.multiply(3)
    await app.reset()
    await machine.createSnapshot()
    await recorder.getSnapshots()
    await pool.query('SELECT * FROM actions')

  Start realtime listener (LISTEN/NOTIFY):
    await machine.start()

  Tip: use DEBUG=remachine:* for verbose logs
  `);

  const server = repl.start({
    prompt: 'pg-counter > ',
    useGlobal: true,
  });

  server.context.app = app;
  server.context.machine = machine;
  server.context.recorder = recorder;
  server.context.pool = pool;

  server.on('exit', async () => {
    machine.stop();
    await pool.end();
    process.exit(0);
  });
}).catch((err) => {
  console.error('Failed to connect to Postgres. Is it running?\n', err.message);
  console.error('\nStart it with: docker compose up -d');
  process.exit(1);
});
