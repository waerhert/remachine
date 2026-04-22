import { App, Context, Middleware, logger } from '../../src/core/index.js';

interface CounterState {
  count: number;
}

export class Counter extends App {
  state: CounterState = {
    count: 0,
  };

  @Middleware(logger)
  increment(_ctx: Context, amount: number = 1) {
    this.state.count += amount;
  }

  @Middleware(logger)
  decrement(_ctx: Context, amount: number = 1) {
    this.state.count -= amount;
  }

  @Middleware(logger)
  reset(_ctx: Context) {
    this.state.count = 0;
  }

  @Middleware(logger)
  multiply(_ctx: Context, factor: number) {
    this.state.count *= factor;
  }
}
