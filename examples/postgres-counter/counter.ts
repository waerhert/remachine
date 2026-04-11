import { App, Context, Middleware, logger } from '../../src/core/index.js';

interface CounterState {
  count: number;
  history: { action: string; value: number; timestamp: number }[];
}

export class Counter extends App {
  state: CounterState = {
    count: 0,
    history: [],
  };

  queries = {
    getHistory: ({ last }: { last?: number }) => {
      const h = this.state.history;
      return last ? h.slice(-last) : h;
    },
  };

  @Middleware(logger)
  increment(_ctx: Context, amount: number = 1) {
    this.state.count += amount;
    this.state.history.push({ action: 'increment', value: amount, timestamp: Date.now() });
  }

  @Middleware(logger)
  decrement(_ctx: Context, amount: number = 1) {
    this.state.count -= amount;
    this.state.history.push({ action: 'decrement', value: amount, timestamp: Date.now() });
  }

  @Middleware(logger)
  reset(_ctx: Context) {
    this.state.count = 0;
    this.state.history.push({ action: 'reset', value: 0, timestamp: Date.now() });
  }

  @Middleware(logger)
  multiply(_ctx: Context, factor: number) {
    this.state.count *= factor;
    this.state.history.push({ action: 'multiply', value: factor, timestamp: Date.now() });
  }
}
