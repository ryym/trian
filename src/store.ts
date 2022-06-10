import { Block, BlockDeletionEvent, BlockUpdateEvent } from "./block";
import { Loader, LoaderCacheInvalidateEvent, LoaderDeletionEvent } from "./loader";
import {
  Selector,
  AsyncSelector,
  SelectorCacheInvalidateEvent,
  AnySelector,
  SelectorDeletionEvent,
} from "./selector";
import { AnyGetKey, AnyGetResult } from "./loader";

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export type EventListener<E> = (event: E) => void;

export type CachableKey<T> = Selector<T> | AsyncSelector<T> | Loader<T>;

export interface BlockState<T> {
  current: T;
  changeListeners: EventListener<BlockUpdateEvent<T>>[];
  deletionListeners: EventListener<BlockDeletionEvent<T>>[];
}

export interface CachableState<T> {
  cache: SelectorCache<T>;
  invalidationListeners: EventListener<SelectorCacheInvalidateEvent<T>>[];
  deletionListeners: EventListener<SelectorDeletionEvent<T>>[];
}

export interface SelectorState<T> extends CachableState<T> {
  dependencies: SelectorDependency<any>[];
}

export interface SelectorDependency<T> {
  readonly key: Block<T> | Selector<T>;
  readonly lastValue: T;
  readonly unsubscribe: Unsubscribe;
}

export interface AsyncSelectorState<T> extends CachableState<T> {
  updating: SelectorUpdating<T> | null;
  dependencies: AsyncSelectorDependency[];
}

export interface AsyncSelectorDependency {
  readonly unsubscribe: Unsubscribe;
}

export interface LoaderState<T> {
  cache: LoaderCache<T>;
  updating: LoaderUpdating<T> | null;
  invalidationListeners: EventListener<LoaderCacheInvalidateEvent<T>>[];
  deletionListeners: EventListener<LoaderDeletionEvent<T>>[];
  dependencies: LoaderDependency[];
}

export interface LoaderDependency {
  readonly unsubscribe: Unsubscribe;
}

export type LoaderCache<T> =
  | { isFresh: false; last: null | { value: T } }
  | { isFresh: true; value: T };

export interface LoaderUpdating<T> {
  areDepsFresh: boolean;
  isDiscarded?: boolean;
  valuePromise: Promise<T>;
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
    invalidationListeners: [],
    deletionListeners: [],
    dependencies: [],
  };
};

const initAsyncSelectorState = <T>(): AsyncSelectorState<T> => {
  return {
    cache: { isFresh: false, last: null },
    updating: null,
    invalidationListeners: [],
    deletionListeners: [],
    dependencies: [],
  };
};

const initLoaderState = <T>(): LoaderState<T> => {
  return {
    cache: { isFresh: false, last: null },
    updating: null,
    invalidationListeners: [],
    deletionListeners: [],
    dependencies: [],
  };
};

export class ActiveValueDeletionError extends Error {
  constructor(valueType: "block" | "selector" | "loader", listenerCount: number) {
    super(`cannot delete subscribed ${valueType} (${listenerCount} listeners exist)`);
  }
}

export class Store<BlockCtx> {
  private readonly blockStates = new Map<Block<any>, BlockState<any>>();

  private readonly blockContext: BlockCtx;

  private readonly selectorStates = new Map<Selector<any>, SelectorState<any>>();
  private readonly asyncSelectorStates = new Map<AsyncSelector<any>, AsyncSelectorState<any>>();

  private readonly loaderStates = new Map<Loader<any>, LoaderState<any>>();

  constructor(blockContext: BlockCtx) {
    this.blockContext = blockContext;
  }

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

  private getBlockState<T>(block: Block<T>): BlockState<T> {
    const [state] = this.getOrInitBlockState(block, null);
    return state;
  }

  private getOrInitBlockState<T>(
    block: Block<T>,
    initialValue: null | (() => T),
  ): [state: BlockState<T>, initialized: boolean] {
    let state = this.blockStates.get(block);
    if (state != null) {
      return [state, false];
    }

    const value = initialValue == null ? block.default(this.blockContext) : initialValue();
    state = {
      current: value,
      changeListeners: [],
      deletionListeners: [],
    };
    if (block.onUpdate != null) {
      state.changeListeners.push(block.onUpdate);
    }
    if (block.onDelete != null) {
      state.deletionListeners.push(block.onDelete);
    }
    this.blockStates.set(block, state);
    return [state, true];
  }

  private getSelectorValue = <T>(selector: Selector<T>): T => {
    const state = this.getSelectorState(selector);
    if (state.cache.isFresh) {
      return state.cache.value;
    }

    // If the cache exists and any dependencies does not change,
    // treat the current cache as a fresh value.
    if (state.cache.last != null) {
      let areDepsSame = true;
      for (const dep of state.dependencies) {
        const value = this.getValue(dep.key);
        if (value !== dep.lastValue) {
          areDepsSame = false;
          break;
        }
      }
      if (areDepsSame) {
        const value = state.cache.last.value;
        state.cache = { isFresh: true, value };
        return value;
      }
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache.isFresh) {
        const last = { value: state.cache.value };
        state.cache = { isFresh: false, last };
        state.invalidationListeners.forEach((f) => f({ last }));
      }
    };

    const get = <U>(key: Block<U> | Selector<U>): U => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      const value = this.getValue(key);
      state.dependencies.push({ key, unsubscribe, lastValue: value });
      return value;
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

  getAnyValue = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
    if (key instanceof AsyncSelector || key instanceof Loader) {
      return this.getAsyncValue(key) as AnyGetResult<K>;
    } else {
      return this.getValue(key);
    }
  };

  getAsyncValue = async <T>(key: AsyncSelector<T> | Loader<T>): Promise<T> => {
    if (key instanceof Loader) {
      return this.getLoaderValue(key);
    } else {
      return this.getAsyncSelectorValue(key);
    }
  };

  getLoaderValue = async <T>(loader: Loader<T>): Promise<T> => {
    const state = this.getLoaderState(loader);
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
        this.loaderStates.set(loader, initLoaderState());
        return this.getAsyncValue(loader);
      }
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache.isFresh) {
        const last = { value: state.cache.value };
        state.cache = { isFresh: false, last: last };
        state.invalidationListeners.forEach((f) => f({ last }));
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

    const valuePromise = loader.run({ get, set: this.setValue }, this.blockContext);
    state.updating = { areDepsFresh: true, valuePromise };

    let value: T = await valuePromise;
    if (state.cache.last != null && loader.isSame(state.cache.last.value, value)) {
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

  getAsyncSelectorValue = async <T>(selector: AsyncSelector<T>): Promise<T> => {
    const state = this.getAsyncSelectorState(selector);
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
        this.asyncSelectorStates.set(selector, initAsyncSelectorState());
        return this.getAsyncValue(selector);
      }
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache.isFresh) {
        const last = { value: state.cache.value };
        state.cache = { isFresh: false, last: last };
        state.invalidationListeners.forEach((f) => f({ last }));
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

    const valuePromise = selector.run({ get: get as any });
    state.updating = { areDepsFresh: true, valuePromise };

    let value: T = await valuePromise;
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

  private getCachableState<T>(selector: CachableKey<T>): CachableState<T> {
    if (selector instanceof AsyncSelector) {
      return this.getAsyncSelectorState(selector);
    } else if (selector instanceof Loader) {
      return this.getLoaderState(selector);
    } else {
      return this.getSelectorState(selector);
    }
  }

  private getSelectorState<T>(selector: Selector<T>): SelectorState<T> {
    let state = this.selectorStates.get(selector);
    if (state == null) {
      state = initSelectorState();
      if (selector.onCacheInvalidate != null) {
        state.invalidationListeners.push(selector.onCacheInvalidate);
      }
      if (selector.onDelete != null) {
        state.deletionListeners.push(selector.onDelete);
      }
      this.selectorStates.set(selector, state);
    }
    return state;
  }

  private getAsyncSelectorState<T>(selector: AsyncSelector<T>): AsyncSelectorState<T> {
    let state = this.asyncSelectorStates.get(selector);
    if (state == null) {
      state = initAsyncSelectorState();
      if (selector.onCacheInvalidate != null) {
        state.invalidationListeners.push(selector.onCacheInvalidate);
      }
      if (selector.onDelete != null) {
        state.deletionListeners.push(selector.onDelete);
      }
      this.asyncSelectorStates.set(selector, state);
    }
    return state;
  }

  private getLoaderState<T>(loader: Loader<T>): LoaderState<T> {
    let state = this.loaderStates.get(loader);
    if (state == null) {
      state = initLoaderState();
      if (loader.onCacheInvalidate != null) {
        state.invalidationListeners.push(loader.onCacheInvalidate);
      }
      if (loader.onDelete != null) {
        state.deletionListeners.push(loader.onDelete);
      }
      this.loaderStates.set(loader, state);
    }
    return state;
  }

  isFreshCache = <T>(key: CachableKey<T>, value: T): boolean => {
    const state = this.getCachableState(key);
    return state.cache.isFresh && state.cache.value === value;
  };

  // XXX: not type safe
  onInvalidate = <T>(
    key: AnyGetKey<T>,
    listener: EventListener<
      BlockUpdateEvent<T> | SelectorCacheInvalidateEvent<T> | LoaderCacheInvalidateEvent<T>
    >,
  ): Unsubscribe => {
    if (key instanceof Block) {
      return this.onBlockUpdate(key, listener);
    } else if (key instanceof Loader) {
      return this.onLoaderCacheInvalidate(key, listener);
    } else {
      return this.onSelectorCacheInvalidate(key, listener);
    }
  };

  onBlockUpdate = <T>(
    block: Block<T>,
    listener: (event: BlockUpdateEvent<T>) => void,
  ): Unsubscribe => {
    const state = this.getBlockState(block);
    state.changeListeners.push(listener);
    return function unsubscribe() {
      state.changeListeners = state.changeListeners.filter((f) => f !== listener);
    };
  };

  onBlockDelete = <T>(
    block: Block<T>,
    listener: (event: BlockDeletionEvent<T>) => void,
  ): Unsubscribe => {
    const state = this.getBlockState(block);
    state.deletionListeners.push(listener);
    return function unsubscribe() {
      state.deletionListeners = state.deletionListeners.filter((f) => f !== listener);
    };
  };

  onSelectorCacheInvalidate = <T>(
    selector: AnySelector<T>,
    listener: EventListener<SelectorCacheInvalidateEvent<T>>,
  ): Unsubscribe => {
    const state = this.getCachableState(selector);
    state.invalidationListeners.push(listener);
    return function unsubscribe() {
      state.invalidationListeners = state.invalidationListeners.filter((f) => f !== listener);
    };
  };

  onLoaderCacheInvalidate = <T>(
    loader: Loader<T>,
    listener: EventListener<LoaderCacheInvalidateEvent<T>>,
  ): Unsubscribe => {
    const state = this.getLoaderState(loader);
    state.invalidationListeners.push(listener);
    return function unsubscribe() {
      state.invalidationListeners = state.invalidationListeners.filter((f) => f !== listener);
    };
  };

  onSelectorDelete = <T>(
    selector: AnySelector<T>,
    listener: (event: SelectorDeletionEvent<T>) => void,
  ): Unsubscribe => {
    const state = this.getCachableState(selector);
    state.deletionListeners.push(listener);
    return function unsubscribe() {
      state.deletionListeners = state.deletionListeners.filter((f) => f !== listener);
    };
  };

  onLoaderDelete = <T>(
    loader: Loader<T>,
    listener: (event: LoaderDeletionEvent<T>) => void,
  ): Unsubscribe => {
    const state = this.getLoaderState(loader);
    state.deletionListeners.push(listener);
    return function unsubscribe() {
      state.deletionListeners = state.deletionListeners.filter((f) => f !== listener);
    };
  };

  getCacheValue = <T>(selector: CachableKey<T>): { value: T } | null => {
    const cache = this.getCachableState(selector).cache;
    return cache.isFresh ? { value: cache.value } : null;
  };

  setValue = <T>(block: Block<T>, nextValue: T | UpdateValue<T>): void => {
    const state = this.getBlockState(block);

    let value: T;
    // Distinguish a normal function from a class object by checking a prototype does not exist.
    if (typeof nextValue === "function" && nextValue.prototype === undefined) {
      value = (nextValue as UpdateValue<T>)(state.current);
    } else {
      value = nextValue as T;
    }

    if (block.isSame(state.current, value)) {
      return;
    }
    state.current = value;
    state.changeListeners.forEach((f) => f({ type: "NewValue", value }));
  };

  trySetInitialValue = <T>(
    block: Block<T>,
    initialValue: () => T,
  ): [value: T, initialized: boolean] => {
    const [state, initialized] = this.getOrInitBlockState(block, initialValue);
    return [state.current, initialized];
  };

  delete = (key: AnyGetKey<any>): boolean => {
    if (key instanceof Block) {
      return this.deleteBlock(key);
    } else if (key instanceof Selector) {
      return this.deleteSelector(key);
    } else if (key instanceof AsyncSelector) {
      return this.deleteAsyncSelector(key);
    } else {
      return this.deleteLoader(key);
    }
  };

  private deleteBlock = (block: Block<any>): boolean => {
    const state = this.blockStates.get(block);
    if (state == null) {
      return false;
    }
    if (0 < state.changeListeners.length) {
      throw new ActiveValueDeletionError("block", state.changeListeners.length);
    }
    this.blockStates.delete(block);
    state.deletionListeners.forEach((f) => f({ lastValue: state.current }));
    return true;
  };

  private deleteSelector = (selector: Selector<any>): boolean => {
    const state = this.selectorStates.get(selector);
    if (state == null) {
      return false;
    }
    if (0 < state.invalidationListeners.length) {
      throw new ActiveValueDeletionError("selector", state.invalidationListeners.length);
    }
    this.selectorStates.delete(selector);
    state.dependencies.forEach((d) => d.unsubscribe());
    const { cache } = state;
    const last = cache.isFresh ? { value: cache.value } : cache.last;
    state.deletionListeners.forEach((f) => f({ last }));
    return true;
  };

  private deleteAsyncSelector = (selector: AsyncSelector<any>): boolean => {
    const state = this.asyncSelectorStates.get(selector);
    if (state == null) {
      return false;
    }
    if (0 < state.invalidationListeners.length) {
      throw new ActiveValueDeletionError("selector", state.invalidationListeners.length);
    }
    this.asyncSelectorStates.delete(selector);
    state.dependencies.forEach((d) => d.unsubscribe());
    const { cache } = state;
    const last = cache.isFresh ? { value: cache.value } : cache.last;
    state.deletionListeners.forEach((f) => f({ last }));
    return true;
  };

  private deleteLoader = (loader: Loader<any>): boolean => {
    const state = this.loaderStates.get(loader);
    if (state == null) {
      return false;
    }
    if (0 < state.invalidationListeners.length) {
      throw new ActiveValueDeletionError("loader", state.invalidationListeners.length);
    }
    this.loaderStates.delete(loader);
    state.dependencies.forEach((d) => d.unsubscribe());
    const { cache } = state;
    const last = cache.isFresh ? { value: cache.value } : cache.last;
    state.deletionListeners.forEach((f) => f({ last }));
    return true;
  };
}

export const createStore = <BlockCtx = undefined>(
  blockCtx?: BlockCtx,
): Store<BlockCtx | undefined> => {
  return new Store(blockCtx);
};
