import { block } from "../block";
import { loader } from "../loader";
import { selector } from "../selector";
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

      it("skip re-computation if possible (selector dependency)", async () => {
        const nums = block({ default: () => [3, 4, 5] });
        const doubleNum = selector({ get: ({ get }) => get(nums)[0] * 2 });
        const minusNum = loader({
          fetch: async ({ get }) => [get(doubleNum) * -1],
        });

        const store = createStore();
        const values: number[][] = [];
        values.push(await store.getAsyncValue(minusNum));
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.getAsyncValue(minusNum));
        expect(values).toEqual([[-6], [-6]]);
        expect(values[0]).toBe(values[1]); // the final value keeps referencial equality.
      });

      it("skip re-computation if possible (selector dependency via loader)", async () => {
        const nums = block({ default: () => [3, 4, 5] });
        const firstNum = selector({ get: ({ get }) => get(nums)[0] });
        const doubleNum = loader({ fetch: async ({ get }) => get(firstNum) * 2 });
        const minusNum = loader({
          fetch: async ({ get }) => [(await get(doubleNum)) * -1],
        });

        const store = createStore();
        const values: number[][] = [];
        values.push(await store.getAsyncValue(minusNum));
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.getAsyncValue(minusNum));
        expect(values).toEqual([[-6], [-6]]);
        expect(values[0]).toBe(values[1]); // the final value keeps referencial equality.
      });
    });

    describe("when any of dependencies changed during computation", () => {
      it("re-computes value and returns the newer result", async () => {
        const pauser = new Pauser();
        const numValue = block({ default: () => 4 });
        const squareValue = loader({
          fetch: async ({ get }) => {
            const n = get(numValue);
            if (n === 4) {
              await pauser.pause();
            }
            return n * n;
          },
        });
        const store = createStore();

        // It resolves to the value 9*9 even if the block is changed after
        // the loader computation starts.
        const squarePromise1 = store.getAsyncValue(squareValue);
        store.setValue(numValue, 9);
        pauser.resume();
        expect(await squarePromise1).toEqual(81);
      });

      it("discards first computation immediately on revalidation", async () => {
        const pauser = new Pauser();
        const numValue = block({ default: () => 4 });
        const squareValue = loader({
          fetch: async ({ get }) => {
            const n = get(numValue);
            if (n === 4) {
              await pauser.pause();
            }
            return n * n;
          },
        });
        const store = createStore();

        // The first call that depends on numValue:4 never finishes
        // since we does not resume the pauser. But the promise resolves with no problem.
        const squarePromise1 = store.getAsyncValue(squareValue);
        store.setValue(numValue, 9);
        expect(await squarePromise1).toEqual(81);
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
        it("discards first computation and all calls get newer result", async () => {
          const pauser = new Pauser();
          const numValue = block({ default: () => 4 });
          let nCalled = 0;
          const squareValue = loader({
            fetch: async ({ get }) => {
              nCalled += 1;
              const n = get(numValue);
              if (n === 4) {
                await pauser.pause();
              }
              return n * n;
            },
          });
          const store = createStore();

          const promises: Promise<unknown>[] = [];
          promises.push(store.getAsyncValue(squareValue));
          promises.push(store.getAsyncValue(squareValue));
          store.setValue(numValue, 9);
          pauser.resume();
          promises.push(store.getAsyncValue(squareValue));
          promises.push(store.getAsyncValue(squareValue));

          const values = await Promise.all(promises);
          expect({ values, nCalled }).toEqual({
            values: [81, 81, 81, 81],
            nCalled: 2,
          });
        });
      });
    });
  });
});
