import { block } from "../block";
import { LoadableLoading } from "../loadable";
import { resource } from "../resource";
import { selector } from "../selector";
import { createStore } from "../store";
import { Pauser } from "./lib/pauser";

describe("Resource and Store", () => {
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
        await store.fetchResource(numValue).promise(),
        await store.fetchResource(numValue).promise(),
        await store.fetchResource(numValue).promise(),
      ];
      expect({ values, nCalled }).toEqual({ values: [1, 1, 1], nCalled: 1 });
    });

    it("can set value to other blocks", async () => {
      const numValue = block({ default: () => 0 });
      const minusValue = block({ default: () => 0 });
      const squareValue = resource({
        fetch: async (p) => {
          const n = p.get(numValue);
          return n * n;
        },
        setResult: (n, p) => {
          p.set(minusValue, -n);
        },
      });

      const store = createStore();
      const blockValues = () => [store.getValue(numValue), store.getValue(minusValue)];
      const resValue = await store.fetchResource(squareValue).promise();
      expect([resValue, ...blockValues()]).toEqual([0, 0, -0]);

      store.setValue(numValue, 5);
      const resValue2 = await store.fetchResource(squareValue).promise();
      expect([resValue2, ...blockValues()]).toEqual([25, 5, -25]);
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
        values.push(await store.fetchResource(squareValue).promise());
        values.push(await store.fetchResource(squareValue).promise());
        store.setValue(numValue, 7);
        values.push(await store.fetchResource(squareValue).promise());
        values.push(await store.fetchResource(squareValue).promise());

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
        values.push(await store.fetchResource(minusValue).promise());
        values.push(await store.fetchResource(minusValue).promise());
        store.setValue(numValue, 9);
        values.push(await store.fetchResource(minusValue).promise());
        values.push(await store.fetchResource(minusValue).promise());

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
        values.push(await store.fetchResource(minusNum).promise());
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.fetchResource(minusNum).promise());
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
        values.push(await store.fetchResource(minusNum).promise());
        store.setValue(nums, [3, 7, 8]); // firstNum stays same.
        values.push(await store.fetchResource(minusNum).promise());
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
        const squarePromise1 = store.fetchResource(squareValue).promise();
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
        const squarePromise1 = store.fetchResource(squareValue).promise();
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
            store.fetchResource(squareValue).promise(),
            store.fetchResource(squareValue).promise(),
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
          promises.push(store.fetchResource(squareValue).promise());
          promises.push(store.fetchResource(squareValue).promise());
          store.setValue(numValue, 9);
          pauser.resume();
          promises.push(store.fetchResource(squareValue).promise());
          promises.push(store.fetchResource(squareValue).promise());

          const values = await Promise.all(promises);
          expect({ values, nCalled }).toEqual({
            values: [81, 81, 81, 81],
            nCalled: 2,
          });
        });
      });
    });

    describe("when computation failed", () => {
      it("reruns computation on next call", async () => {
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

        const firstResult = store.fetchResource(numValue);
        const err = await firstResult.promise().catch((err) => err);
        shouldThrow = false;
        const value = await store.fetchResource(numValue).promise();
        expect([err, value]).toEqual(["fake-error", 10]);
      });
    });

    describe("when resource can be prebuilt", () => {
      it("returns prebuilt value as latest on first load", async () => {
        const numValue = block({ default: () => 5 });
        const minusValue = block({ default: () => 0 });
        const squareValue = resource({
          prebuild: () => 9,
          fetch: async (p) => {
            const n = p.get(numValue);
            return n * n;
          },
          setResult: (n, p) => {
            p.set(minusValue, -n);
          },
        });
        const store = createStore();

        const loadable = store.fetchResource(squareValue) as LoadableLoading<number>;
        expect([loadable.state, loadable.latestValue]).toEqual(["loading", 9]);
        expect(store.getValue(minusValue)).toEqual(-9);
        expect([await loadable.promise(), store.getValue(minusValue)]).toEqual([25, -25]);

        store.setValue(numValue, 8);
        const loadable2 = store.fetchResource(squareValue) as LoadableLoading<number>;
        expect([loadable2.state, loadable2.latestValue]).toEqual(["loading", 25]);
        expect([await loadable2.promise(), store.getValue(minusValue)]).toEqual([64, -64]);
      });
    });
  });

  describe("store.onResourceResultChange", () => {
    it("fires event when loaded resource result is set", async () => {
      let shouldFail = false;
      const numValue = block({ default: () => 5 });
      const squareValue = resource({
        fetch: async (p) => {
          if (shouldFail) {
            throw "fake-error";
          }
          const n = p.get(numValue);
          return n * n;
        },
      });

      const store = createStore();

      let phase = "initial";

      // Store event snapshots on resource result change.
      const events: unknown[] = [];
      store.onResourceResultChange(squareValue, (event) => {
        let result: unknown[];
        switch (event.result.state) {
          case "hasValue":
            result = [event.result.state, event.result.value];
            break;
          case "hasError":
            result = [event.result.state, event.result.error];
        }
        const gotResult = store.getCurrentResource(squareValue);
        events.push({ phase, result, same: event.result === gotResult });
      });

      phase = "first-load";
      await store.fetchResource(squareValue).promise();

      phase = "cache-load";
      await store.fetchResource(squareValue).promise();

      phase = "success-load-after-invalidate";
      store.setValue(numValue, 6);
      await store.fetchResource(squareValue).promise();

      phase = "failure-load-after-invalidate";
      store.setValue(numValue, 7);
      shouldFail = true;
      await store
        .fetchResource(squareValue)
        .promise()
        .catch(() => {});

      phase = "success-load-after-failure";
      shouldFail = false;
      await store.fetchResource(squareValue).promise();

      expect(events).toEqual([
        { phase: "first-load", result: ["hasValue", 25], same: true },
        { phase: "success-load-after-invalidate", result: ["hasValue", 36], same: true },
        { phase: "failure-load-after-invalidate", result: ["hasError", "fake-error"], same: true },
        { phase: "success-load-after-failure", result: ["hasValue", 49], same: true },
      ]);
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

      const value = await store.fetchResource(numResource).promise();
      expect([value, loadCount]).toEqual([10, 1]);

      return new Promise<void>((resolve) => {
        // Recompute the resource result immediately on its invalidation.
        store.onInvalidate(numResource, async () => {
          try {
            const value = await store.fetchResource(numResource).promise();
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
