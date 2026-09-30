import type { ChildProcess, SpawnOptions } from "node:child_process";

export const HERMES_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS) || 5 * 60_000;
export const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS) || 8 * 60_000;

// Keep Codex from escalating to expensive reasoning for simple image tasks.
export function codexLimitArgs(): string[] {
  const args = ["-c", `model_reasoning_effort="${process.env.CODEX_REASONING_EFFORT || "low"}"`];
  if (process.env.CODEX_MODEL) args.push("-m", process.env.CODEX_MODEL);
  return args;
}

// Spawn Codex with `detached: true` so the node wrapper and the native binary share a process group.
export const CODEX_SPAWN_OPTIONS: SpawnOptions = { stdio: ["ignore", "pipe", "pipe"], detached: true };

// Kill the Codex process group on timeout or when the caller aborts (e.g. client disconnected).
export function guardCodexProcess(child: ChildProcess, signal?: AbortSignal) {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const killGroup = (sig: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, sig);
    } catch {
      child.kill(sig);
    }
  };
  const kill = (reason: string) => {
    if (exited()) return;
    console.warn(`⛔ Killing Codex process: ${reason}`);
    killGroup("SIGTERM");
    setTimeout(() => !exited() && killGroup("SIGKILL"), 5_000).unref();
  };
  const timer = setTimeout(() => kill(`timed out after ${CODEX_TIMEOUT_MS}ms`), CODEX_TIMEOUT_MS);
  const onAbort = () => kill("request aborted");
  signal?.addEventListener("abort", onAbort, { once: true });
  child.once("close", () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  });
}

export function hermesSignal() {
  return AbortSignal.timeout(HERMES_TIMEOUT_MS);
}

// Allow only one expensive AI job per key at a time.
const running = new Set<string>();

export function tryAcquire(key: string): (() => void) | null {
  if (running.has(key)) return null;
  running.add(key);
  let released = false;
  return () => {
    if (!released) running.delete(key);
    released = true;
  };
}
