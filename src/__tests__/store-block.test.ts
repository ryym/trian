import { block, BlockUpdateEvent } from '../block';
import { createStore } from '../store';

describe('Block and Store', () => {
  describe('store.getValue', () => {
    it('returns current block value', () => {
      const strValue = block({ default: () => 'a' });
      const store = createStore();
      const value = store.getValue(strValue);
      expect(value).toEqual('a');
    });
  });

  describe('store.setValue', () => {
    it('updates block value', () => {
      const strValue = block({ default: () => '' });
      const store = createStore();

      const firstValue = store.getValue(strValue);
      store.setValue(strValue, 'hello');
      const secondValue = store.getValue(strValue);

      expect([firstValue, secondValue]).toEqual(['', 'hello']);
    });

    it('can set value even if block does not exist on store yet', () => {
      const strValue = block({ default: () => '' });
      const store = createStore();

      store.setValue(strValue, 'hello');
      expect(store.getValue(strValue)).toEqual('hello');
    });

    describe('updating by function', () => {
      it('enables to update value using current value', () => {
        const countValue = block({ default: () => 15 });
        const store = createStore();

        store.setValue(countValue, (n) => n * 2);
        const value = store.getValue(countValue);

        expect(value).toEqual(30);
      });

      it('distinguishes class object from function', () => {
        class Foo {}
        class SubFoo extends Foo {}
        const FooValue = block({ default: () => Foo });
        const store = createStore();

        store.setValue(FooValue, SubFoo);
        const value = store.getValue(FooValue);

        expect(value).toEqual(SubFoo);
      });
    });
  });

  describe('store.remove', () => {
    it('removes block from store', () => {
      const countValue = block({ default: () => 0 });
      const store = createStore();

      store.setValue(countValue, 100);
      const valueBeforeRemove = store.getValue(countValue);
      store.remove(countValue);
      const valueAfterRemove = store.getValue(countValue);

      expect([valueBeforeRemove, valueAfterRemove]).toEqual([100, 0]);
    });

    it('returns block is remove or not', () => {
      const countValue = block({ default: () => 0 });
      const store = createStore();

      store.getValue(countValue);
      const removed1 = store.remove(countValue);
      const removed2 = store.remove(countValue);

      expect([removed1, removed2]).toEqual([true, false]);
    });

    describe('when update listener exists', () => {
      it('removes listeners as well', () => {
        const countValue = block({ default: () => 0 });
        const store = createStore();
        const listener = jest.fn();

        store.onBlockUpdate(countValue, listener);
        store.remove(countValue);
        store.setValue(countValue, 5);
        store.setValue(countValue, 6);

        expect(listener.mock.calls.length).toEqual(1);
      });
    });
  });

  describe('store.onBlockUpdate', () => {
    it('notifies listeners when block value changes', () => {
      const countValue = block({ default: () => 0 });
      const store = createStore();
      const listeners = [jest.fn(), jest.fn()];

      listeners.forEach((l) => store.onBlockUpdate(countValue, l));
      store.setValue(countValue, 10);
      store.setValue(countValue, -128);
      store.remove(countValue);
      store.setValue(countValue, 5);

      const expectedCalls: [BlockUpdateEvent<number>][] = [
        [{ type: 'NewValue', value: 10 }],
        [{ type: 'NewValue', value: -128 }],
        [{ type: 'Removed' }],
        // No events after removed.
      ];
      listeners.forEach((l) => {
        expect(l.mock.calls).toEqual(expectedCalls);
      });
    });
  });

  describe('Block context', () => {
    class AppState {
      constructor(readonly loggedIn: boolean = false, readonly version: string = '1.0') {}
    }

    type Context = { userID: number | null; version: string };

    const appStateValue = block({
      default: (ctx?: Context) => {
        if (ctx == null) {
          return new AppState();
        }
        return new AppState(ctx.userID != null, ctx.version);
      },
    });

    it('allows block to compute default value dynamically', () => {
      const context: Context = { userID: 1, version: '1.2' };
      const store = createStore(context);
      const value = store.getValue(appStateValue);
      expect(value).toEqual(new AppState(true, '1.2'));
    });

    it('does not require store to have context', () => {
      const store = createStore();
      const value = store.getValue(appStateValue);
      expect(value).toEqual(new AppState(false, '1.0'));
    });
  });
});
