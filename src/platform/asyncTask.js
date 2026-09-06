// One owner, one current operation. Replacing context invalidates even transports
// that ignore AbortSignal; callers must check isCurrent before publishing results.
export function createAsyncTask() {
  let controller = null
  return {
    cancel() { controller?.abort(); controller = null },
    start() {
      controller?.abort()
      const next = new AbortController()
      controller = next
      return { signal: next.signal, isCurrent: () => controller === next && !next.signal.aborted }
    },
  }
}
