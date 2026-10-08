import express from "express";
import { z } from "zod";
import { tryAcquire } from "./ai.limits.js";

// Reject duplicate expensive AI jobs (double clicks, re-sent requests, parallel tabs).
// Codex routes share one lock: parallel runs also break the "newest generated image" detection.
// The lock is held until the handler finishes, not just until the client disconnects.
export function singleFlight(key: string, handler: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    const release = tryAcquire(key);
    if (!release) {
      return res.status(409).json({
        success: false,
        error: "A generation is already running. Please wait for it to finish.",
      });
    }
    try {
      await handler(req, res, next);
    } finally {
      release();
    }
  };
}

// Abort remaining AI work when the client disconnects before the response finishes.
export function abortOnDisconnect(res: express.Response) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}


export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Re-running the whole agent rarely fixes bad output or a timeout; it only doubles token usage.
    const notRetryable =
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error &&
        (error.name === "HermesOutputError" ||
          error.name === "TimeoutError" ||
          error.name === "AbortError" ||
          error.message.includes("did not return")));

    if (retries <= 0 || notRetryable) {
      throw error;
    }

    console.log("AI call failed. Retrying once...");

    return withRetry(
      fn,
      retries - 1
    );
  }
}

// Node's fetch only says "fetch failed"; the useful part (ECONNREFUSED, ENOTFOUND, timeout...) is on error.cause.
export function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string; address?: string; port?: number } | undefined;
  const reason = cause ? [cause.code, cause.address && `${cause.address}${cause.port ? `:${cause.port}` : ""}`, !cause.code && cause.message].filter(Boolean).join(" ") : "";
  return reason ? `${error.message} (${reason})` : error.message;
}
