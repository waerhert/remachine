import { Machine, createPostgresAdapter } from '../../src/index.js';
import { Counter } from './counter.js';

const PG_URL = process.env.PG_URL || 'postgres://remachine:remachine@localhost:5433/remachine';

export async function main() {
  const { reader, writer, recorder, pool } = await createPostgresAdapter({
    connection: PG_URL,
    namespace: 'counter',
  });

  const machine = new Machine(
    Counter,
    reader,
    writer,
    recorder,
  );

  const app = machine.getInstance();

  return { machine, app, recorder, pool };
}
