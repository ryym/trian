import { Block } from './block';
import { Selector, AsyncSelector, AnyGetKey, AnyGetResult, AnySelector } from './selector';

export interface BlockState<T> {
  current: T;
  changeListeners: SetValue<T>[];
}

export interface SelectorState<T> {
  cache: SelectorCache<T>;
  updating: SelectorUpdating<T> | null;
  invalidationListeners: Array<() => void>;
  dependencies: Array<{ unsubscribe: Unsubscribe }>;
}

export type SelectorCache<T> =
  | { isFresh: false; last: null | { value: T } }
  | { isFresh: true; value: T };

export interface SelectorUpdating<T> {
  areDepsFresh: boolean;
  isDiscarded?: boolean;
  valuePromise: Promise<T>;
}

const initSelectorState = <T>(): SelectorState<T> => {
  return {
    cache: { isFresh: false, last: null },
    updating: null,
    invalidationListeners: [],
    dependencies: [],
  };
};

export type SetValue<T> = (value: T) => void;

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export class Store<BlockCtx> {
  private readonly blockStates: Map<Block<any>, BlockState<any>> = new Map();

  private readonly blockContext: BlockCtx;

  private readonly selectorStates: Map<AnySelector<any>, SelectorState<any>> = new Map();

  constructor(blockContext: BlockCtx) {
    this.blockContext = blockContext;
  }

  private getBlockState<T>(block: Block<T>): BlockState<T> {
    let state = this.blockStates.get(block);
    if (state == null) {
      state = { current: block.default(this.blockContext), changeListeners: [] };
      this.blockStates.set(block, state);
    }
    return state;
  }

  onBlockValueChange = <T>(block: Block<T>, listener: SetValue<T>): Unsubscribe => {
    const state = this.getBlockState(block);
    state.changeListeners.push(listener);

    const unsubscribe = () => {
      state.changeListeners = state.changeListeners.filter((f) => f !== listener);
      if (block.autoClear && state.changeListeners.length === 0) {
        this.blockStates.delete(block);
      }
    };
    return unsubscribe;
  };

  getValue = <T>(key: Block<T> | Selector<T>): T => {
    if (key instanceof Block) {
      return this.getBlockValue(key);
    } else if (key instanceof Selector) {
      return this.getSelectorValue(key);
    } else {
      throw new Error(`[trian] Invalid store key: ${key}`);
    }
  };

  private getBlockValue = <T>(block: Block<T>): T => {
    return this.getBlockState(block).current;
  };

  private getSelectorValue = <T>(selector: Selector<T>): T => {
    const state = this.getSelectorState(selector);
    if (state.cache.isFresh) {
      return state.cache.value;
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache.isFresh) {
        state.cache = { isFresh: false, last: { value: state.cache.value } };
        state.invalidationListeners.forEach((f) => f());
      }
    };

    const get = <U>(key: Block<U> | Selector<U>): U => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      return this.getValue(key);
    };

    let value = selector.run({ get });
    if (state.cache.last != null && selector.isSame(state.cache.last.value, value)) {
      // If the computed result is same as the last value, use the last value to
      // keep its referential equality.
      value = state.cache.last.value;
    }

    state.cache = { isFresh: true, value };
    return state.cache.value;
  };

  getAsyncValue = async <T>(selector: AsyncSelector<T>): Promise<T> => {
    const state = this.getSelectorState(selector);
    if (state.cache.isFresh) {
      return Promise.resolve(state.cache.value);
    }

    if (state.updating != null) {
      if (state.updating.areDepsFresh) {
        // If someone is already computing the same async selector, just wait for it
        // to avoid duplicate execution.
        return await state.updating.valuePromise;
      } else {
        // But if some dependencies are updated, we should re-compute the value. To do so,
        // we discard the current computation by replacing the selector state with a new one.
        state.updating.isDiscarded = true;
        this.selectorStates.set(selector, initSelectorState());
        return this.getAsyncValue(selector);
      }
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache.isFresh) {
        state.cache = { isFresh: false, last: { value: state.cache.value } };
        state.invalidationListeners.forEach((f) => f());
      }
      if (state.updating != null) {
        state.updating.areDepsFresh = false;
      }
    };

    const get = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      return this.getAnyValue(key);
    };

    const valuePromise = selector.run({ get });
    state.updating = { areDepsFresh: true, valuePromise };

    let value = await valuePromise;
    if (state.cache.last != null && selector.isSame(state.cache.last.value, value)) {
      // If the computed result is same as the last value, use the last value to
      // keep its referential equality.
      value = state.cache.last.value;
    }

    if (state.updating.isDiscarded) {
      // This state is no longer used so remove the subscriptions.
      state.dependencies.forEach((d) => d.unsubscribe());
    }
    if (state.updating.areDepsFresh) {
      state.cache = { isFresh: true, value };
    } else {
      // When some dependencies are updated during the computation,
      // we mark the cache as non-fresh to run the computation again on the next call.
      // Note that the current computation returns a stale value either way.
      state.cache = { isFresh: false, last: { value } };
    }

    state.updating = null;
    return value;
  };

  getAnyValue = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
    if (key instanceof AsyncSelector) {
      return this.getAsyncValue(key as any) as AnyGetResult<K>;
    } else {
      return this.getValue(key as any);
    }
  };

  private getSelectorState<T>(selector: AnySelector<T>): SelectorState<T> {
    let state = this.selectorStates.get(selector);
    if (state == null) {
      state = initSelectorState();
      this.selectorStates.set(selector, state);
    }
    return state;
  }

  isFreshCache = <T>(key: AsyncSelector<T>, value: T): boolean => {
    const state = this.getSelectorState(key);
    return state.cache.isFresh && state.cache.value === value;
  };

  onInvalidate = (key: AnyGetKey<any>, listener: () => void): Unsubscribe => {
    if (key instanceof Block) {
      return this.onBlockValueChange(key, listener);
    } else {
      const state = this.getSelectorState(key);
      state.invalidationListeners.push(listener);
      return function unsubscribe() {
        state.invalidationListeners = state.invalidationListeners.filter((f) => f !== listener);
      };
    }
  };

  getCacheValue = <T>(selector: AnySelector<T>): T | undefined => {
    const cache = this.getSelectorState(selector).cache;
    return cache.isFresh ? cache.value : undefined;
  };

  setValue = <T>(block: Block<T>, value: T): void => {
    const state = this.getBlockState(block);
    if (block.isSame(state.current, value)) {
      return;
    }
    state.current = value;
    state.changeListeners.forEach((f) => f(value));
  };

  updateValue = <T>(block: Block<T>, updateValue: UpdateValue<T>): void => {
    const state = this.getBlockState(block);
    const nextValue = updateValue(state.current);
    this.setValue(block, nextValue);
  };
}

export const createStore = <BlockCtx = undefined>(blockCtx?: BlockCtx) => {
  return new Store(blockCtx);
};
