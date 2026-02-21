import { expect } from 'chai';
import { processWithConcurrency } from '../../src/shared/concurrency.js';

describe('concurrency', () => {
  it('should process all items with correct concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const action = async (item: number) => {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) {
        maxConcurrent = concurrentCount;
      }

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 10));

      processed.push(item);
      concurrentCount--;
    };

    await processWithConcurrency(items, 2, action);

    expect(processed).to.have.lengthOf(5);
    expect(processed).to.have.members([1, 2, 3, 4, 5]);
    expect(maxConcurrent).to.be.at.most(2);
  });

  it('should handle empty lists', async () => {
    const items: number[] = [];
    let processedCount = 0;

    await processWithConcurrency(items, 2, async () => {
      processedCount++;
    });

    expect(processedCount).to.equal(0);
  });

  it('should handle zero or negative concurrency limits by defaulting to 1', async () => {
    const items = [1, 2, 3];
    let maxConcurrent = 0;
    let concurrentCount = 0;

    await processWithConcurrency(items, 0, async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrentCount--;
    });

    expect(maxConcurrent).to.equal(1);
  });

  it('should propagate errors from the action', async () => {
    const items = [1, 2, 3];

    try {
      await processWithConcurrency(items, 2, async (item) => {
        if (item === 2) {
          throw new Error('Test error');
        }
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).to.equal('Test error');
      }
    }
  });
});
