import { block } from "../block";
import { LoadableLoading } from "../loadable";
import { resource } from "../resource";
import { selector } from "../selector";
import { createStore } from "../store";
import { Pauser } from "./lib/pauser";

describe("Resource and Store", () => {
  describe("store.getResourceValue", () => {
    it("returns resource value", async () => {
      const numValue = resource({
        fetch: () => Promise.resolve(1),
      });
      const store = createStore();
      const value = await store.getResourceValue(numValue);
      expect(value).toEqual(1);
    });

    it("throws on error", async () => {
      const numValue = resource({
        fetch: () => Promise.reject("failed"),
      });
      const store = createStore();
      const value = await store.getResourceValue(numValue).catch((err) => err);
      expect(value).toEqual("failed");
    });
  });

  describe("store.getResource", () => {
    it("computes and caches value", async () => {
      let nCalled = 0;
      const numValue = resource({
        fetch: () => {
          return Promise.resolve(++nCalled);
        },
      });
      const store = createStore();

      const values = [
        await store.getResource(numValue).promise(),
        await store.getResource(numValue).promise(),
        await store.getResource(numValue).promise(),
      ];
      expect({ values, nCalled }).toEqual({ values: [1, 1, 1], nCalled: 1 });
    });

    describe("when any of dependencies changed", () => {
      it("re-computes value (direct dependency changes)", async () => {
        const numValue = block({ default: () => 2 });
        let nCalled = 0;
        const squareValue = resource({
          fetch: async (p) => {
            nCalled += 1;
            return p.get(numValue) * p.get(numValue);
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(await store.getResource(squareValue).promise());
        values.push(await store.getResource(squareValue).promise());
        store.setValue(numValue, 7);
        values.push(await store.getResource(squareValue).promise());
        values.push(await store.getResource(squareValue).promise());

        expect({ values, nCalled }).toEqual({ values: [4, 4, 49, 49], nCalled: 2 });
      });

      it("re-computes value (indirect dependency changes)", async () => {
        const numValue = block({ default: () => 2 });
        const squareValue = resource({
          fetch: async (p) => p.get(numValue) * p.get(numValue),
        });
        let nCalled = 0;
        const minusValue = resource({
          fetch: async (p) => {
            nCalled += 1;
            const sq = await p.fetch(squareValue);
            return sq * -1;
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(await store.getResource(minusValue).promise());
        values.push(await store.getResource(minusValue).promise());
        store.setValue(numValue, 9);
        values.push(await store.getResource(minusValue).promise());
        values.push(await store.getResource(minusValue).promise());

        expect({ values, nCalled }).toEqual({ values: [-4, -4, -81, -81], nCalled: 2 });
      });

      it("skip re-computation if possible (selector dependency)", async () => {
        const nums = block({ default: () => [3, 4, 5] });
        const doubleNum = selector({ get: (p) => p.get(nums)[0] * 2 });
        const minusNum = resource({
          fetch: async (p) => [p.get(doubleNum) * -1],
        });

        const store = createStore();
        const values: number[][] = [];
        values.push(await store.getResource(minusNum).promise());
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.getResource(minusNum).promise());
        expect(values).toEqual([[-6], [-6]]);
        expect(values[0]).toBe(values[1]); // the final value keeps referencial equality.
      });

      it("skip re-computation if possible (selector dependency via resource)", async () => {
        const nums = block({ default: () => [3, 4, 5] });
        const firstNum = selector({ get: (p) => p.get(nums)[0] });
        const doubleNum = resource({
          fetch: async (p) => p.get(firstNum) * 2,
        });
        const minusNum = resource({
          fetch: async (p) => [(await p.fetch(doubleNum)) * -1],
        });

        const store = createStore();
        const values: number[][] = [];
        values.push(await store.getResource(minusNum).promise());
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.getResource(minusNum).promise());
        expect(values).toEqual([[-6], [-6]]);
        expect(values[0]).toBe(values[1]); // the final value keeps referencial equality.
      });
    });

    describe("when any of dependencies changed during computation", () => {
      it("re-computes value and returns the newer result", async () => {
        const pauser = new Pauser();
        const numValue = block({ default: () => 4 });
        const squareValue = resource({
          fetch: async (p) => {
            const n = p.get(numValue);
            if (n === 4) {
              await pauser.pause();
            }
            return n * n;
          },
        });
        const store = createStore();

        // It resolves to the value 9*9 even if the block is changed after
        // the resource computation starts.
        const squarePromise1 = store.getResource(squareValue).promise();
        store.setValue(numValue, 9);
        pauser.resume();
        expect(await squarePromise1).toEqual(81);
      });

      it("discards first computation immediately on revalidation", async () => {
        const pauser = new Pauser();
        const numValue = block({ default: () => 4 });
        const squareValue = resource({
          fetch: async (p) => {
            const n = p.get(numValue);
            if (n === 4) {
              await pauser.pause();
            }
            return n * n;
          },
        });
        const store = createStore();

        // The first call that depends on numValue:4 never finishes
        // since we does not resume the pauser. But the promise resolves with no problem.
        const squarePromise1 = store.getResource(squareValue).promise();
        store.setValue(numValue, 9);
        expect(await squarePromise1).toEqual(81);
      });
    });

    describe("when same resource is used during computation", () => {
      describe("when dependencies does not change", () => {
        it("reuse current computation result", async () => {
          const pauser = new Pauser();
          const numValue = block({ default: () => 4 });
          let nCalled = 0;
          const squareValue = resource({
            fetch: async (p) => {
              nCalled += 1;
              const n = p.get(numValue);
              await pauser.pause();
              return n * n;
            },
          });
          const store = createStore();

          const squarePromises = [
            store.getResource(squareValue).promise(),
            store.getResource(squareValue).promise(),
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
          const squareValue = resource({
            fetch: async (p) => {
              nCalled += 1;
              const n = p.get(numValue);
              if (n === 4) {
                await pauser.pause();
              }
              return n * n;
            },
          });
          const store = createStore();

          const promises: Promise<unknown>[] = [];
          promises.push(store.getResource(squareValue).promise());
          promises.push(store.getResource(squareValue).promise());
          store.setValue(numValue, 9);
          pauser.resume();
          promises.push(store.getResource(squareValue).promise());
          promises.push(store.getResource(squareValue).promise());

          const values = await Promise.all(promises);
          expect({ values, nCalled }).toEqual({
            values: [81, 81, 81, 81],
            nCalled: 2,
          });
        });
      });
    });

    describe("when computation failed", () => {
      it("reruns computation next time by default", async () => {
        let shouldThrow = true;
        const numValue = resource({
          fetch: async () => {
            if (shouldThrow) {
              throw "fake-error";
            }
            return 10;
          },
        });
        const store = createStore();

        const firstResult = store.getResource(numValue);
        const err = await firstResult.promise().catch((err) => err);
        shouldThrow = false;
        const value = await store.getResource(numValue).promise();
        expect([err, value]).toEqual(["fake-error", 10]);
      });

      it("keeps returning last error result if desired", async () => {
        const numValue = resource({
          fetch: async () => {
            throw "fake-error";
          },
        });
        const store = createStore();

        const result1 = store.getResource(numValue);
        const err = await result1.promise().catch((err) => err);
        const result2 = store.getResource(numValue, { keepError: true });
        const result3 = store.getResource(numValue, { keepError: true });
        expect([err, result2.state]).toEqual(["fake-error", "hasError"]);
        expect(result2).toBe(result3);
      });
    });

    describe("when resource can be prebuilt", () => {
      it("returns prebuilt value on first load", async () => {
        const numValue = block({ default: () => 5 });
        const squareValue = resource({
          prebuild: () => 0,
          fetch: async (p) => {
            const n = p.get(numValue);
            return n * n;
          },
        });
        const store = createStore();

        const loadable = store.getResource(squareValue) as LoadableLoading<number>;
        expect([loadable.state, loadable.prebuilt]).toEqual(["loading", 0]);
        expect(await loadable.promise()).toEqual(25);

        store.setValue(numValue, 8);
        const loadable2 = store.getResource(squareValue) as LoadableLoading<number>;
        expect([loadable2.state, loadable2.prebuilt]).toEqual(["loading", undefined]);
        expect(await loadable2.promise()).toEqual(64);
      });
    });
  });

  describe("[regression] avoid unnecessary double computation", () => {
    it("reuse the current computation correctly", async () => {
      const numValue = block({
        default: () => 1,
      });

      let loadCount = 0;
      const numResource = resource({
        fetch: async (p) => {
          loadCount += 1;
          await new Promise((r) => setTimeout(r, 10));
          return p.get(numValue) * 10;
        },
      });

      const store = createStore();

      const value = await store.getResourceValue(numResource);
      expect([value, loadCount]).toEqual([10, 1]);

      return new Promise<void>((resolve) => {
        // Recompute the resource result immediately on its invalidation.
        store.onInvalidate(numResource, async () => {
          try {
            const value = await store.getResourceValue(numResource);
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
