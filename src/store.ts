import { Block } from './block';
import { Selector, AsyncSelector, AnyGetKey, AnyGetResult, AnySelector } from './selector';

export interface BlockState<T> {
  current: T;
  changeListeners: SetValue<T>[];
}

export interface SelectorState<T> {
  cache: { value: T } | null;
  updating: SelectorUpdating<T> | null;
  invalidationListeners: Array<() => void>;
  dependencies: Array<{ unsubscribe: Unsubscribe }>;
}

export interface SelectorUpdating<T> {
  areDepsFresh: boolean;
  isDiscarded?: boolean;
  valuePromise: Promise<T>;
}

const initSelectorState = <T>(): SelectorState<T> => {
  return { cache: null, updating: null, invalidationListeners: [], dependencies: [] };
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
    if (state.cache) {
      return state.cache.value;
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache != null) {
        state.cache = null;
        state.invalidationListeners.forEach((f) => f());
      }
    };

    const get = <U>(key: Block<U> | Selector<U>): U => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      return this.getValue(key);
    };

    const value = selector.run({ get });
    state.cache = { value };
    return state.cache.value;
  };

  getAsyncValue = async <T>(selector: AsyncSelector<T>): Promise<T> => {
    const state = this.getSelectorState(selector);
    if (state.cache) {
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
      if (state.cache != null) {
        state.cache = null;
        state.invalidationListeners.forEach((f) => f());
      }
      if (state.updating != null) {
        state.updating.areDepsFresh = false;
      }
    };

    const get = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      if (key instanceof AsyncSelector) {
        return this.getAsyncValue(key as any) as AnyGetResult<K>;
      } else {
        return this.getValue(key as any);
      }
    };

    const valuePromise = selector.run({ get });
    state.updating = { areDepsFresh: true, valuePromise };
    const value = await valuePromise;

    if (state.updating.isDiscarded) {
      // This state is no longer used so remove the subscriptions.
      state.dependencies.forEach((d) => d.unsubscribe());
    } else if (state.updating.areDepsFresh) {
      // Cache the value only if it is fresh.
      // When some dependencies are updated during the computation,
      // we do not store a cache to run the computation again on the next call.
      // Note that the current computation returns a stale value either way.
      state.cache = { value };
    }
    state.updating = null;
    return value;
  };

  private getSelectorState<T>(selector: AnySelector<T>): SelectorState<T> {
    let state = this.selectorStates.get(selector);
    if (state == null) {
      state = initSelectorState();
      this.selectorStates.set(selector, state);
    }
    return state;
  }

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
    return this.getSelectorState(selector).cache?.value;
  };

  setValue = <T>(block: Block<T>, value: T): void => {
    const state = this.getBlockState(block);
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
