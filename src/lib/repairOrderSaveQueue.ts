/**
 * Serializes repair-order PUTs so flush + immediate save cannot race.
 */

let saveChain: Promise<unknown> = Promise.resolve();
let pendingCount = 0;

export function enqueueRepairOrderSave<T>(task: () => Promise<T>): Promise<T> {
  pendingCount += 1;
  const next = saveChain.then(
    () => task(),
    () => task()
  );
  saveChain = next.then(
    () => {
      pendingCount = Math.max(0, pendingCount - 1);
      return undefined;
    },
    () => {
      pendingCount = Math.max(0, pendingCount - 1);
      return undefined;
    }
  );
  return next;
}

export async function awaitRepairOrderSaveQueue(): Promise<void> {
  await saveChain;
}

/** True while one or more RO saves are queued or in flight. */
export function isRepairOrderSaveQueueBusy(): boolean {
  return pendingCount > 0;
}

/** Prevent story generation / navigation from blocking on a stuck PUT chain. */
export async function awaitRepairOrderSaveQueueWithTimeout(timeoutMs: number): Promise<boolean> {
  try {
    await Promise.race([
      saveChain,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('repair order save queue timeout')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
