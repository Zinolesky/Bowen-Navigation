declare module "node:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  const strictAssert: {
    (value: unknown, message?: string | Error): asserts value;
    ok(value: unknown, message?: string | Error): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    deepEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
  };
  export default strictAssert;
}
