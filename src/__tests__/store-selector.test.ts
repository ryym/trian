import { block } from "../block";
import { selector, SelectorCacheInvalidateEvent } from "../selector";
import { createStore } from "../store";

describe("Selector and Store", () => {
  describe("store.getValue", () => {
    it("computes and caches selector value", () => {
      let nCalled = 0;
      const fn = jest.fn().mockImplementation(() => ++nCalled);
      const numValue = selector<number>({ get: fn });
      const store = createStore();

      const values = [store.getValue(numValue), store.getValue(numValue), store.getValue(numValue)];
      const calledCount = fn.mock.calls.length;
      expect({ values, calledCount }).toEqual({ values: [1, 1, 1], calledCount: 1 });
    });

    describe("when any of dependencies changed", () => {
      it("re-computes value (direct dependency changes)", () => {
        const numValue = block({ default: () => 2 });
        let nCalled = 0;
        const squareValue = selector({
          get: ({ get }) => {
            nCalled += 1;
            return get(numValue) * get(numValue);
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(store.getValue(squareValue));
        values.push(store.getValue(squareValue));
        store.setValue(numValue, 7);
        values.push(store.getValue(squareValue));
        values.push(store.getValue(squareValue));

        expect({ values, nCalled }).toEqual({ values: [4, 4, 49, 49], nCalled: 2 });
      });

      it("re-computes value (indirect dependency changes)", () => {
        const numValue = block({ default: () => 2 });
        const squareValue = selector({
          get: ({ get }) => get(numValue) * get(numValue),
        });
        let nCalled = 0;
        const minusValue = selector({
          get: ({ get }) => {
            nCalled += 1;
            return get(squareValue) * -1;
          },
        });

        const store = createStore();
        const values: number[] = [];
        values.push(store.getValue(minusValue));
        values.push(store.getValue(minusValue));
        store.setValue(numValue, 9);
        values.push(store.getValue(minusValue));
        values.push(store.getValue(minusValue));

        expect({ values, nCalled }).toEqual({ values: [-4, -4, -81, -81], nCalled: 2 });
      });
    });
  });

  describe("store.remove", () => {
    it("returns selector is remove or not", () => {
      const countValue = selector({ get: () => 0 });
      const store = createStore();

      store.getValue(countValue);
      const removed1 = store.remove(countValue);
      const removed2 = store.remove(countValue);

      expect([removed1, removed2]).toEqual([true, false]);
    });

    describe("when cache invalidation listener exists", () => {
      it("removes listeners as well", () => {
        const numValue = block({ default: () => 3 });
        const doubleValue = selector({ get: ({ get }) => get(numValue) * 2 });
        const store = createStore();
        const listener = jest.fn();

        store.onSelectorCacheInvalidate(doubleValue, listener);
        store.remove(doubleValue);
        store.setValue(numValue, 10);

        expect(listener.mock.calls.length).toEqual(1);
      });
    });
  });

  describe("store.delete", () => {
    it("returns whether selector is deleted or not", () => {
      const countValue = selector({ get: () => 0 });
      const store = createStore();

      store.getValue(countValue);
      const deleted1 = store.delete(countValue);
      const deleted2 = store.delete(countValue);

      expect([deleted1, deleted2]).toEqual([true, false]);
    });

    describe("when cache invalidation listener exists", () => {
      it("throws error", () => {
        const numValue = selector({ get: () => 3 });
        const doubleValue = selector({ get: ({ get }) => get(numValue) * 2 });
        const store = createStore();

        // Subscribe the numValue.
        expect(store.getValue(doubleValue)).toEqual(6);

        expect(() => {
          store.delete(numValue);
        }).toThrow(/cannot delete subscribed selector/);

        store.delete(doubleValue);
        expect(store.delete(numValue)).toBe(true);
      });
    });

    describe("when deletion listener exists", () => {
      it("calls listeners with last value", () => {
        const countValue = selector({ get: () => 3 });
        const store = createStore();
        const listener = jest.fn();
        store.onSelectorDelete(countValue, listener);

        expect(store.getValue(countValue)).toEqual(3);
        store.delete(countValue);
        expect(listener.mock.calls).toEqual([[{ last: { value: 3 } }]]);
      });
    });
  });

  describe("store.onSelectorCacheInvalidate", () => {
    it("notifies listeners when selector cache becomes invalidated", () => {
      const messageValue = block({ default: () => "default" });
      const upperValue = selector({ get: ({ get }) => get(messageValue).toUpperCase() });
      const store = createStore();
      const listeners = [jest.fn(), jest.fn()];

      listeners.forEach((l) => store.onSelectorCacheInvalidate(upperValue, l));
      // Cache the first result value.
      store.getValue(upperValue);
      // Invalidate the cache.
      store.setValue(messageValue, "new_message");
      // Rechange the block value but this does not cause a invalidation
      // because the cache is already invalidated.
      store.setValue(messageValue, "new_message2");
      store.getValue(upperValue);

      store.remove(upperValue);
      store.getValue(upperValue);
      store.setValue(messageValue, "last");

      const expectedCalls: [SelectorCacheInvalidateEvent<string>][] = [
        [{ last: { value: "DEFAULT" } }],
        [{ last: { value: "NEW_MESSAGE2" }, removed: true }],
        // No events after removed.
      ];
      listeners.forEach((l) => {
        expect(l.mock.calls).toEqual(expectedCalls);
      });
    });
  });

  describe("store.getCacheValue", () => {
    it("returns cache value", () => {
      const constValue = selector({ get: () => 123 });
      const store = createStore();

      const valueBeforeCall = store.getCacheValue(constValue);
      store.getValue(constValue);
      const valueAfterCall = store.getCacheValue(constValue);

      expect([valueBeforeCall, valueAfterCall]).toEqual([null, { value: 123 }]);
    });
  });
});
