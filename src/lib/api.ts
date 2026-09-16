export { fail } from "./auth";

export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

/**
 * Wrap a route handler: thrown `Response`s (from fail()/requireUser()) are returned as-is,
 * anything else becomes a 500 with a plain message.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return Response.json({ success: false, message: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Next 15 passes route params as a Promise. */
export type Ctx<P extends Record<string, string>> = { params: Promise<P> };
