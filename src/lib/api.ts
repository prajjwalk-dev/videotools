// Helpers shared by the API route handlers.

import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a handler so thrown ApiErrors become JSON responses and anything else a 500. */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof ApiError) return jsonError(error.status, error.message);
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, error);
      return jsonError(500, "Internal server error");
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };

export async function readJson<T extends object>(req: Request): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError(400, "JSON body must be an object");
  return parsed as T;
}
