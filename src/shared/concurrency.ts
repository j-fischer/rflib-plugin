export async function processWithConcurrency<T>(
  items: T[],
  concurrencyLimit: number,
  action: (item: T) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, concurrencyLimit);
  const queue = [...items];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        // eslint-disable-next-line no-await-in-loop
        await action(item);
      }
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
}
