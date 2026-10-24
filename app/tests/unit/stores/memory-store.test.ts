import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { runStoreContract } from './store-contract';

runStoreContract('memory', (clock) => createMemoryStore(clock.now));

test('sin reloj inyectado usa Date.now', async () => {
  const store = createMemoryStore();
  expect(await store.increment('x', 60)).toBe(1);
});
