# remachine

An event-sourced state machine library for Node.js. You write an `App` class with state and methods; remachine turns each method call into an action, persists it through a writer, and replays actions through a reader to rebuild state.

## Origin

remachine started as the `machine` module inside the [mintBlue SDK](https://gitlab.com/mintBlue/sdk/) (`src/lib/machine`). That SDK embedded the state machine alongside blockchain plumbing, key management, and a bunch of other concerns. This repo pulls the machine out into a standalone package and drops everything blockchain-specific.

## Install

```
npm install
npm run build
```

## Examples

Each example lives in its own directory under `examples/` and has a small REPL you can play with.

### counter

A fully in-memory counter using `LocalReader` + `LocalWriter` + `MemoryRecorder`. No external services.

```
cd examples/counter
npm run cli
```

Inside the REPL:

```
await app.increment(5)
app.state
await app.decrement(2)
await app.multiply(3)
await recorder.getSnapshots()
```

### postgres-counter

The same counter, but actions are written to and read from Postgres. Uses `docker compose` to spin up Postgres 17 on port `5433`.

```
cd examples/postgres-counter
docker compose up -d
npm run cli
```

The adapter creates its own tables (`remachine_counter_actions`, `remachine_counter_snapshots`) and a `LISTEN/NOTIFY` channel for live updates. Set `PG_URL` to override the default connection string.

To tear down:

```
docker compose down -v
```

## Debug logging

Set `DEBUG=remachine:*` to see every method call the machine dispatches.
