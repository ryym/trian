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
      get: async (p) => {
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
      const numValue = loader<number>({ get: fn });
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
          get: async ({ get }) => {
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
          get: async ({ get }) => get(numValue) * get(numValue),
        });
        let nCalled = 0;
        const minusValue = loader({
          get: async ({ get }) => {
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
          get: async ({ get }) => [get(doubleNum) * -1],
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
        const doubleNum = loader({ get: async ({ get }) => get(firstNum) * 2 });
        const minusNum = loader({
          get: async ({ get }) => [(await get(doubleNum)) * -1],
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
          get: async ({ get }) => {
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
          get: async ({ get }) => {
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
            get: async ({ get }) => {
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
            get: async ({ get }) => {
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

    describe("when computation failed", () => {
      it("throws original error and keeps loader state", async () => {
        let shouldThrow = false;
        const numValue = block({ default: () => 4 });
        const squareValue = loader({
          get: async ({ get }) => {
            console.log("compute!", Date.now());
            if (shouldThrow) {
              throw "fake-error";
            }
            const n = get(numValue);
            return n * n;
          },
        });

        const store = createStore();
        const value1 = await store.getAsyncValue(squareValue);
        store.setValue(numValue, 6);

        shouldThrow = true;
        const error1 = await store.getAsyncValue(squareValue).catch((err) => err);
        expect(error1).toEqual("fake-error");

        shouldThrow = false;
        const value2 = await store.getAsyncValue(squareValue);
        expect([value1, value2]).toEqual([16, 36]);
      });
    });
  });

  describe("store.getSettledAsyncResult", () => {
    it("returns null if no settled result exists", () => {
      const store = createStore();
      const someValue = loader({ get: async () => 1 });
      const result = store.getSettledAsyncResult(someValue);
      expect(result).toBe(null);
    });

    it("returns cached value if async computation successfully finished", async () => {
      const store = createStore();
      const someValue = loader({ get: async () => 1 });
      const value = await store.getAsyncValue(someValue);
      const result = store.getSettledAsyncResult(someValue);
      expect([value, result]).toEqual([1, { ok: true, value: 1 }]);
    });

    it("returns caught error if async computation failed", async () => {
      const store = createStore();
      const someValue = loader({
        get: async () => {
          throw "fake-error";
        },
      });
      const value = await store.getAsyncValue(someValue).catch(() => 0);
      const result = store.getSettledAsyncResult(someValue);
      expect([value, result]).toEqual([0, { ok: false, error: "fake-error" }]);
    });

    it("clears error on next computation", async () => {
      let shouldThrow = true;
      const store = createStore();
      const someValue = loader({
        get: async () => {
          if (shouldThrow) {
            throw "fake-error";
          }
          return 5;
        },
      });
      const value1 = await store.getAsyncValue(someValue).catch(() => 0);
      const result1 = store.getSettledAsyncResult(someValue);

      shouldThrow = false;
      const value2 = await store.getAsyncValue(someValue);
      const result2 = store.getSettledAsyncResult(someValue);

      expect([value1, value2, result1, result2]).toEqual([
        0,
        5,
        { ok: false, error: "fake-error" },
        { ok: true, value: 5 },
      ]);
    });
  });

  describe("[regression] avoid unnecessary double computation", () => {
    it("reuse the currentUpdate promise correctly", async () => {
      const numValue = block({
        default: () => 1,
      });

      let loadCount = 0;
      const numLoader = loader({
        get: async (p) => {
          loadCount += 1;
          await new Promise((r) => setTimeout(r, 10));
          return p.get(numValue) * 10;
        },
      });

      const store = createStore();

      const value = await store.getAsyncValue(numLoader);
      expect([value, loadCount]).toEqual([10, 1]);

      return new Promise<void>((resolve) => {
        // Recompute the numLoader result immediately on its invalidation.
        store.onInvalidate(numLoader, async () => {
          try {
            const value = await store.getAsyncValue(numLoader);
            expect([value, loadCount]).toEqual([20, 2]);
          } finally {
            resolve();
          }
        });
        store.setValue(numValue, (n) => n + 1);
      });
    });
  });
});
