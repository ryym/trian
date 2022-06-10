import { block } from "../block";
import { loader } from "../loader";
import { selectorFamily } from "../selectorFamily";
import { createStore } from "../store";
import { Pauser } from "./lib/pauser";

describe("Loader and Store", () => {
  it("can set block value during computation", async () => {
    type Item = { id: string; value: string };

    const fetchItems = async (): Promise<Item[]> => {
      return [
        { id: "1", value: "item1" },
        { id: "2", value: "item2" },
      ];
    };

    const itemMapValue = block<Record<string, Item>>({
      default: () => ({}),
    });
    const itemsLoader = loader({
      fetch: async (p) => {
        const items = await fetchItems();
        const itemMap = items.reduce((map, item) => {
          map[item.id] = item;
          return map;
        }, {} as Record<string, Item>);
        p.set(itemMapValue, itemMap);
        return items.map((it) => it.id);
      },
    });
    const itemValue = selectorFamily({
      key: (id: string) => id,
      selector: (id: string) => ({
        get: (p) => p.get(itemMapValue)[id],
      }),
    });

    const store = createStore();
    const itemIds = await store.getAsyncValue(itemsLoader);
    const item1 = store.getValue(itemValue.by("1"));
    const item2 = store.getValue(itemValue.by("2"));
    expect([itemIds, item1.value, item2.value]).toEqual([["1", "2"], "item1", "item2"]);
  });

  describe("store.getAsyncValue", () => {
    it("computes and caches loader value", async () => {
      let nCalled = 0;
      const fn = jest.fn().mockImplementation(async () => ++nCalled);
      const numValue = loader<number>({ fetch: fn });
      const store = createStore();

      const values = [
        await store.getAsyncValue(numValue),
        await store.getAsyncValue(numValue),
        await store.getAsyncValue(numValue),
      ];

      const calledCount = fn.mock.calls.length;
      expect({ values, calledCount }).toEqual({ values: [1, 1, 1], calledCount: 1 });
    });

    describe("when any of dependencies changed", () => {
      it("re-computes value (direct dependency changes)", async () => {
        const numValue = block({ default: () => 2 });
        let nCalled = 0;
        const squareValue = loader({
          fetch: async ({ get }) => {
            nCalled += 1;
            return get(numValue) * get(numValue);
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(await store.getAsyncValue(squareValue));
        values.push(await store.getAsyncValue(squareValue));
        store.setValue(numValue, 7);
        values.push(await store.getAsyncValue(squareValue));
        values.push(await store.getAsyncValue(squareValue));

        expect({ values, nCalled }).toEqual({ values: [4, 4, 49, 49], nCalled: 2 });
      });

      it("re-computes value (indirect dependency changes)", async () => {
        const numValue = block({ default: () => 2 });
        const squareValue = loader({
          fetch: async ({ get }) => get(numValue) * get(numValue),
        });
        let nCalled = 0;
        const minusValue = loader({
          fetch: async ({ get }) => {
            nCalled += 1;
            const sq = await get(squareValue);
            return sq * -1;
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(await store.getAsyncValue(minusValue));
        values.push(await store.getAsyncValue(minusValue));
        store.setValue(numValue, 9);
        values.push(await store.getAsyncValue(minusValue));
        values.push(await store.getAsyncValue(minusValue));

        expect({ values, nCalled }).toEqual({ values: [-4, -4, -81, -81], nCalled: 2 });
      });
    });

    describe("when any of dependencies changed during computation", () => {
      it("returns stale value and do not store cache", async () => {
        const pauser = new Pauser();
        const numValue = block({ default: () => 4 });
        const squareValue = loader({
          fetch: async ({ get }) => {
            const n = get(numValue);
            await pauser.pause();
            return n * n;
          },
        });
        const store = createStore();

        // A first call.
        // The numValue changes during the computation so it does not store a cache.
        const squarePromise1 = store.getAsyncValue(squareValue);
        store.setValue(numValue, 9);
        pauser.resume();
        expect(await squarePromise1).toEqual(16);
        expect(store.getCacheValue(squareValue)).toBeNull();

        // A second call.
        // It runs the computation again and stores a cache.
        const squarePromise2 = store.getAsyncValue(squareValue);
        pauser.resume();
        expect(await squarePromise2).toEqual(81);
        expect(store.getCacheValue(squareValue)).toEqual({ value: 81 });

        // A third call.
        // It does not run the computation because the cache exists.
        const squarePromise3 = store.getAsyncValue(squareValue);
        expect(pauser.isPaused()).toBe(false);
        expect(await squarePromise3).toEqual(81);
      });
    });

    describe("when same loader is called during computation", () => {
      describe("when dependencies does not change", () => {
        it("reuse current computation result", async () => {
          const pauser = new Pauser();
          const numValue = block({ default: () => 4 });
          let nCalled = 0;
          const squareValue = loader({
            fetch: async ({ get }) => {
              nCalled += 1;
              const n = get(numValue);
              await pauser.pause();
              return n * n;
            },
          });
          const store = createStore();

          const squarePromises = [
            store.getAsyncValue(squareValue),
            store.getAsyncValue(squareValue),
          ];
          pauser.resume();
          const values = await Promise.all(squarePromises);

          expect({ values, nCalled }).toEqual({ values: [16, 16], nCalled: 1 });
        });
      });

      describe("when any of dependencies has changed", () => {
        it("discards first computation even if it finishes after second", async () => {
          const pausers = [new Pauser(), new Pauser()];
          const numValue = block({ default: () => 4 });
          let callIdx = 0;
          const squareValue = loader({
            fetch: async ({ get }) => {
              const pauser = pausers[callIdx++];
              if (pauser == null) {
                throw new Error(`unexpected call: ${callIdx}`);
              }
              const n = get(numValue);
              await pauser.pause();
              return n * n;
            },
          });
          const store = createStore();

          // 1. Start the first (0) computation.
          const squarePromise0 = store.getAsyncValue(squareValue);

          // 2. Invalidate the first call.
          store.setValue(numValue, 9);

          // 3. Start the second (1) computation.
          const squarePromise1 = store.getAsyncValue(squareValue);

          // 4. Finish the second computation.
          pausers[1].resume();

          // It results to a fresh value and stores a cache.
          expect(await squarePromise1).toEqual(81);
          expect(store.getCacheValue(squareValue)).toEqual({ value: 81 });

          // 5. Finish the first computation.
          pausers[0].resume();

          // It result to a stale value but do not update the cache.
          expect(await squarePromise0).toEqual(16);
          expect(store.getCacheValue(squareValue)).toEqual({ value: 81 });
        });
      });
    });
  });
});
