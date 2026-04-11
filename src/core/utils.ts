import debug from 'debug';

export function deepFreeze<T extends object>(obj: T): T {
  // Retrieve the property names defined on obj
  const propNames = Object.getOwnPropertyNames(obj);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = obj[name as keyof T];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}

export function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export function deepClone<T>(obj: T): T {
  if (obj === null) return null as T;
  if (typeof obj !== 'object') return obj;

  if (obj instanceof Date) {
    return new Date(obj) as T;
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj) as T;
  }

  if (Array.isArray(obj)) {
    const arrCopy = [];
    for (let i = 0; i < obj.length; i++) {
      arrCopy[i] = deepClone(obj[i]);
    }
    return arrCopy as T;
  }

  if (isObject(obj)) {
    const objCopy: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        objCopy[key] = deepClone(obj[key]);
      }
    }
    return objCopy;
  }

  throw new Error("Unable to copy object! Its type isn't supported.");
}

export function LogClassFunctionCalls(namespace?: string) {
  return function (target: { prototype: Record<string, any>; name?: string }) {
    const logger = debug('remachine:' + (namespace || target.name));

    // Loop through all the properties in the class.
    for (const key of Object.getOwnPropertyNames(target.prototype)) {
      const originalFunction = target.prototype[key];

      // Ensure that the property is a function and not the constructor.
      if (typeof originalFunction === 'function' && key !== 'constructor') {
        target.prototype[key] = function (...args: any[]) {
          logger(`${key} called with arguments:`, args);

          // Call the original function.
          return originalFunction.apply(this, args);
        };
      }
    }
  };
}

function LogNoop(..._args: any[]) {}

const DEBUG = true;

export const LogClass = (DEBUG ? LogClassFunctionCalls : LogNoop) as typeof LogClassFunctionCalls;

export const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));
