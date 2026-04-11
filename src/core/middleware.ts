import { Context, MiddlewareFunction } from './types.js';

/**
 * Decorator function to wrap a method with middleware.
 *
 * @param {MiddlewareFunction} middlewareFn - The middleware function to apply.
 * @returns {Function} A decorator that wraps the targeted method with the given middleware.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function Middleware(middlewareFn: MiddlewareFunction) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    /**
     * The new method value after applying middleware.
     *
     * @param {Context} ctx - The context of the call.
     * @param {...any[]} args - Arguments for the original method.
     * @returns {Promise<any>} The result after passing through middleware and the original method.
     */
    descriptor.value = async function (ctx: Context, ...args: any[]) {
      const next = () => originalMethod.apply(this, [ctx, ...args]);
      return middlewareFn(ctx, args, next);
    };

    return descriptor;
  };
}

/**
 * Logger middleware that logs the name of the method being called.
 *
 * @param {Context} ctx - The context in which the middleware operates.
 * @param {any[]} args - Arguments provided to the original method.
 * @param {(newArgs: any[]) => Promise<any>} next - The next function in the middleware chain.
 * @returns {Promise<void>} A promise that resolves after logging and executing the next function in the chain.
 */
export const logger: MiddlewareFunction = async (ctx: Context, args: any[], next: (newArgs: any[]) => Promise<any>) => {
  console.log('Calling ' + ctx?.action?.f);
  await next(args);
};
