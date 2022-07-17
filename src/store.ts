import { Block, BlockDeletionEvent, BlockChangeEvent } from "./block";
import { Loader, LoaderCacheInvalidateEvent, LoaderDeletionEvent } from "./loader";
import { Selector, SelectorCacheInvalidateEvent, SelectorDeletionEvent } from "./selector";
import { AnyGetKey, AnyGetResult } from "./loader";
import { RevalidatableResolver } from "./RevalidatableResolver";

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export type EventListener<E> = (event: E) => void;

export interface ValueInvalidationEvent<T> {
  readonly last: null | { value: T };
}

export type CachableKey<T> = Selector<T> | Loader<T>;

export interface BlockState<T> {
  current: T;
  changeListeners: EventListener<BlockChangeEvent<T>>[];
  deletionListeners: EventListener<BlockDeletionEvent<T>>[];
}

export interface CachableState<T> {
  cache: ValueCache<T>;
  dependencies: CacheDependency<any>[];
}

export type ValueCache<T> =
  | {
      readonly state: "Stale";
      readonly last: null | { value: T };
    }
  | {
      readonly state: "MaybeStale";
      readonly last: { value: T };
    }
  | {
      readonly state: "Fresh";
      readonly value: T;
    };

export type CacheValidity = ValueCache<unknown>["state"];

export type CacheDependency<T> = SyncCacheDependency<T> | AsyncCacheDependency<T>;

export interface SyncCacheDependency<T> {
  readonly key: Block<T> | Selector<T>;
  readonly lastValue: T;
  readonly unsubscribe: Unsubscribe;
}

export interface AsyncCacheDependency<T> {
  readonly key: Loader<T>;
  readonly unsubscribe: Unsubscribe;
}

export interface SelectorState<T> extends CachableState<T> {
  invalidationListeners: EventListener<SelectorCacheInvalidateEvent<T>>[];
  deletionListeners: EventListener<SelectorDeletionEvent<T>>[];
  dependencies: SyncCacheDependency<any>[];
}

export interface LoaderState<T> extends CachableState<T> {
  currentUpdate: RevalidatableResolver<T> | null;
  invalidationListeners: EventListener<LoaderCacheInvalidateEvent<T>>[];
  deletionListeners: EventListener<LoaderDeletionEvent<T>>[];
}

const initSelectorState = <T>(): SelectorState<T> => {
  return {
    cache: { state: "Stale", last: null },
    invalidationListeners: [],
    deletionListeners: [],
    dependencies: [],
  };
};

const initLoaderState = <T>(initialValue: null | (() => T)): LoaderState<T> => {
  return {
    cache: {
      state: "Stale",
      last: initialValue == null ? null : { value: initialValue() },
    },
    currentUpdate: null,
    invalidationListeners: [],
    deletionListeners: [],
    dependencies: [],
  };
};

export type SettledAsyncResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: unknown;
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

  private readonly loaderStates = new Map<Loader<any>, LoaderState<any>>();
  private readonly loaderErrors = new Map<Loader<any>, unknown>();

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
    return this.getOrInitBlockState(block, null);
  }

  private getOrInitBlockState<T>(block: Block<T>, initialValue: null | (() => T)): BlockState<T> {
    let state = this.blockStates.get(block);
    if (state != null) {
      return state;
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
    return state;
  }

  private getSelectorValue = <T>(selector: Selector<T>): T => {
    const state = this.getSelectorState(selector);
    this.precomputeCacheValidity(state);
    if (state.cache.state === "Fresh") {
      return state.cache.value;
    }

    state.dependencies.forEach((d) => d.unsubscribe());

    const invalidateCache = () => {
      if (state.cache.state === "Fresh") {
        const last = { value: state.cache.value };
        state.cache = { state: "MaybeStale", last };
        state.invalidationListeners.forEach((f) => f({ last }));
      }
    };

    const nextDependencies: typeof state.dependencies = [];
    const get = <U>(key: Block<U> | Selector<U>): U => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      const value = this.getValue(key);
      nextDependencies.push({ key, unsubscribe, lastValue: value });
      return value;
    };

    let value = selector.run({ get });
    if (state.cache.last != null && selector.isSame(state.cache.last.value, value)) {
      // If the computed result is same as the last value, use the last value to
      // keep its referential equality.
      value = state.cache.last.value;
    }

    state.cache = { state: "Fresh", value };
    state.dependencies = nextDependencies;
    return state.cache.value;
  };

  getAnyValue = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
    if (key instanceof Loader) {
      return this.getAsyncValue(key) as AnyGetResult<K>;
    } else {
      return this.getValue(key);
    }
  };

  getAsyncValue = async <T>(key: Loader<T>): Promise<T> => {
    return this.getLoaderValue(key);
  };

  getSettledAsyncResult = <T>(key: Loader<T>): SettledAsyncResult<T> | null => {
    return this.getSettledLoaderResult(key);
  };

  private getSettledLoaderResult = <T>(key: Loader<T>): SettledAsyncResult<T> | null => {
    const cache = this.getCacheValue(key);
    if (cache != null) {
      return { ok: true, value: cache.value };
    }
    if (this.loaderErrors.has(key)) {
      const error = this.loaderErrors.get(key);
      return { ok: false, error };
    }
    return null;
  };

  _willRecomputeOnGet = <T>(loader: Loader<T>): boolean => {
    const state = this.getLoaderState(loader);
    return state.currentUpdate != null || this.precomputeCacheValidity(state) !== "Fresh";
  };

  private getLoaderValue = async <T>(loader: Loader<T>): Promise<T> => {
    const state = this.getLoaderState(loader);

    if (state.currentUpdate != null) {
      // If someone is already computing the same loader, just wait for it.
      return state.currentUpdate.resolveWithAutoRevalidation();
    }

    this.precomputeCacheValidity(state);
    if (state.cache.state === "Fresh") {
      return state.cache.value;
    }

    this.loaderErrors.delete(loader);
    state.dependencies.forEach((d) => d.unsubscribe());

    const invalidateCache = () => {
      if (state.currentUpdate != null) {
        state.currentUpdate.requestToRevalidate();
        return;
      }
      if (state.cache.state === "Fresh") {
        const last = { value: state.cache.value };
        state.cache = { state: "MaybeStale", last: last };
        state.invalidationListeners.forEach((f) => f({ last }));
      }
    };

    const nextDependencies: typeof state.dependencies = [];
    const get = <K extends AnyGetKey<any>>(key: K): AnyGetResult<K> => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      if (key instanceof Loader) {
        nextDependencies.push({ key, unsubscribe });
        return this.getAnyValue(key);
      } else {
        const value = this.getValue(key);
        nextDependencies.push({ key, unsubscribe, lastValue: value });
        return value;
      }
    };

    // Store the current update so that concurrent loader calls can share and await a single promise.
    state.currentUpdate = new RevalidatableResolver({
      get: () => {
        return loader.run({ get, set: this.setValue }, this.blockContext);
      },
      revalidate: () => {
        this.loaderStates.set(loader, { ...state, currentUpdate: null });
        return this.getLoaderValue(loader);
      },
    });

    let value: T;
    try {
      // Run the loader computation. If any dependencies are updated during the computation,
      // discard it and run the new computation.
      value = await state.currentUpdate.resolveWithAutoRevalidation();
    } catch (err) {
      this.loaderErrors.set(loader, err);
      throw err;
    } finally {
      state.currentUpdate = null;
    }

    if (state.cache.last != null && loader.isSame(state.cache.last.value, value)) {
      // If the computed result is same as the last value, use the last value to
      // keep its referential equality.
      value = state.cache.last.value;
    }

    state.cache = { state: "Fresh", value };
    state.dependencies = nextDependencies;
    return value;
  };

  private getCachableState<T>(key: CachableKey<T>): CachableState<T> {
    if (key instanceof Loader) {
      return this.getLoaderState(key);
    } else {
      return this.getSelectorState(key);
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

  private getLoaderState<T>(loader: Loader<T>): LoaderState<T> {
    const [state] = this.getOrInitLoaderState(loader, null);
    return state;
  }

  private getOrInitLoaderState<T>(
    loader: Loader<T>,
    initialValue: null | (() => T),
  ): [state: LoaderState<T>, initialized: boolean] {
    let state = this.loaderStates.get(loader);
    if (state != null) {
      return [state, false];
    }

    state = initLoaderState(initialValue);
    if (loader.onCacheInvalidate != null) {
      state.invalidationListeners.push(loader.onCacheInvalidate);
    }
    if (loader.onDelete != null) {
      state.deletionListeners.push(loader.onDelete);
    }
    this.loaderStates.set(loader, state);
    return [state, true];
  }

  private precomputeCacheValidity<T>(state: CachableState<T>): CacheValidity {
    // When the cache is marked as MaybeStale, check if any of its dependencies have been actually changed.
    // If so, the cache is Stale. Otherwise we can keep using the current cache so mark it as Fresh.
    if (state.cache.state === "MaybeStale" && state.cache.last != null) {
      const allFresh = state.dependencies.every((d) => {
        if (d.key instanceof Loader) {
          // If the dependency is a loader, avoid running value computation here.
          // Instead check its dependencies recursively.
          const st = this.getLoaderState(d.key);
          return this.precomputeCacheValidity(st) === "Fresh";
        } else {
          return this.getValue(d.key) === (d as SyncCacheDependency<unknown>).lastValue;
        }
      });
      if (allFresh) {
        state.cache = { state: "Fresh", value: state.cache.last.value };
      } else {
        state.cache = { state: "Stale", last: state.cache.last };
      }
    }
    return state.cache.state;
  }

  onInvalidate = <T>(
    key: AnyGetKey<T>,
    listener: EventListener<ValueInvalidationEvent<T>>,
  ): Unsubscribe => {
    if (key instanceof Block) {
      return this.onBlockChange(key, (event) => {
        listener({ last: { value: event.lastValue } });
      });
    } else if (key instanceof Loader) {
      return this.onLoaderCacheInvalidate(key, listener);
    } else {
      return this.onSelectorCacheInvalidate(key, listener);
    }
  };

  onBlockChange = <T>(
    block: Block<T>,
    listener: (event: BlockChangeEvent<T>) => void,
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
    selector: Selector<T>,
    listener: EventListener<SelectorCacheInvalidateEvent<T>>,
  ): Unsubscribe => {
    const state = this.getSelectorState(selector);
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
    selector: Selector<T>,
    listener: (event: SelectorDeletionEvent<T>) => void,
  ): Unsubscribe => {
    const state = this.getSelectorState(selector);
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
    return cache.state === "Fresh" ? { value: cache.value } : null;
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
    const lastValue = state.current;
    state.current = value;
    state.changeListeners.forEach((f) => f({ lastValue, value }));
  };

  trySetInitialValue = <T>(key: Block<T> | Loader<T>, initialValue: () => T): boolean => {
    if (this.has(key)) {
      return false;
    }
    if (key instanceof Block) {
      this.getOrInitBlockState(key, initialValue);
      return true;
    } else {
      this.getOrInitLoaderState(key, initialValue);
      return true;
    }
  };

  delete = (key: AnyGetKey<any>): boolean => {
    if (key instanceof Block) {
      return this.deleteBlock(key);
    } else if (key instanceof Selector) {
      return this.deleteSelector(key);
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
    const last = cache.state === "Fresh" ? { value: cache.value } : cache.last;
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
    const last = cache.state === "Fresh" ? { value: cache.value } : cache.last;
    state.deletionListeners.forEach((f) => f({ last }));
    return true;
  };

  has = (key: AnyGetKey<any>): boolean => {
    if (key instanceof Block) {
      return this.blockStates.has(key);
    } else if (key instanceof Selector) {
      return this.selectorStates.has(key);
    } else {
      return this.loaderStates.has(key);
    }
  };
}

export const createStore = <BlockCtx = undefined>(
  blockCtx?: BlockCtx,
): Store<BlockCtx | undefined> => {
  return new Store(blockCtx);
};
