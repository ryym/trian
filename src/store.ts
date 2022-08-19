import { Block, BlockDeletionEvent, BlockChangeEvent } from "./block";
import { Selector, SelectorCacheInvalidateEvent, SelectorDeletionEvent } from "./selector";
import { Context, createContext } from "./context";
import {
  Loadable,
  loadableError,
  LoadableError,
  loadableLoading,
  LoadableLoading,
  LoadableResult,
  loadableValue,
  LoadableValue,
} from "./loadable";
import { Resource, ResourceFetchParams } from "./resource";
import { makeRestartablePromise } from "./restartablePromise";

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export type EventListener<E> = (event: E) => void;

export interface ValueInvalidationEvent<T> {
  readonly last: null | { value: T };
}

export type CachableKey<T> = Selector<T>;

export interface BlockState<T> {
  current: T;
  changeListeners: EventListener<BlockChangeEvent<T>>[];
  deletionListeners: EventListener<BlockDeletionEvent<T>>[];
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

export type CacheDependency<T> = SyncCacheDependency<T>;

export interface SyncCacheDependency<T> {
  readonly key: Block<T> | Selector<T>;
  readonly lastValue: T;
  readonly unsubscribe: Unsubscribe;
}

export interface SelectorState<T> {
  cache: ValueCache<T>;
  invalidationListeners: EventListener<SelectorCacheInvalidateEvent<T>>[];
  deletionListeners: EventListener<SelectorDeletionEvent<T>>[];
  dependencies: SyncCacheDependency<any>[];
}

const initSelectorState = <T>(): SelectorState<T> => {
  return {
    cache: { state: "Stale", last: null },
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

export interface ResourceState<T> {
  cache: ResourceCache<T>;
  dependencies: AnyResourceCacheDependency<any>[];
  invalidationListeners: EventListener<ValueInvalidationEvent<T>>[];
  resourceResultChangeListeners: EventListener<ResourceResultChangeEvent<T>>[];
  // deletionListeners
}

export interface ResourceResultChangeEvent<T> {
  readonly result: LoadableResult<T>;
}

const initResourceState = <T>(): ResourceState<T> => {
  return {
    cache: { state: "Stale", loadable: null },
    invalidationListeners: [],
    dependencies: [],
    resourceResultChangeListeners: [],
  };
};

export type AnyResourceCacheDependency<T> = SyncCacheDependency<T> | ResourceCacheDependency<T>;

export type ResourceCache<T> =
  | {
      readonly state: "Stale";
      readonly loadable: null | LoadableValue<T>;
    }
  | {
      readonly state: "MaybeStale";
      readonly loadable: LoadableValue<T>;
    }
  | {
      readonly state: "Fresh";
      readonly loadable: LoadableValue<T>;
    }
  | {
      readonly state: "Loading";
      readonly loadable: LoadableLoading<T>;
      readonly revalidate: () => void;
    }
  | {
      readonly state: "Error";
      readonly loadable: LoadableError<T>;
    };

export type ResourceCacheState = ResourceCache<unknown>["state"];

export interface ResourceCacheDependency<T> {
  readonly key: Resource<T>;
  readonly unsubscribe: Unsubscribe;
}

interface SetResourceValueParams<T> {
  readonly value: T;
  readonly isTentative?: boolean;
  readonly nextDependencies: AnyResourceCacheDependency<any>[] | null;
}

export interface RefetchResourceParams<T> {
  readonly preupdate?: (value: T) => T;
}

export class ActiveValueDeletionError extends Error {
  constructor(valueType: "block" | "selector", listenerCount: number) {
    super(`cannot delete subscribed ${valueType} (${listenerCount} listeners exist)`);
  }
}

export class Store {
  readonly context: Context;
  private readonly blockStates = new Map<Block<any>, BlockState<any>>();
  private readonly selectorStates = new Map<Selector<any>, SelectorState<any>>();
  private readonly resourceStates = new Map<Resource<any>, ResourceState<any>>();

  constructor() {
    this.context = createContext();
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
    let state = this.blockStates.get(block);
    if (state != null) {
      return state;
    }

    const value = block.default(this.context);
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
    this.precomputeSelectorCacheValidity(state);
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

  fetchResource = <T>(resource: Resource<T>): Loadable<T> => {
    const state = this.getResourceState(resource);

    if (state.cache.state === "Loading") {
      return state.cache.loadable;
    }

    this.precomputeResourceCacheValidity(state);
    if (state.cache.state === "Fresh") {
      return state.cache.loadable;
    }

    let latestValue: T | undefined = undefined;
    if (state.cache.loadable == null) {
      const prebuilt = resource.prebuild({ get: this.getValue }, this.context);
      if (prebuilt != null) {
        latestValue = prebuilt.value;
        const loadable = this.setResourceValue(resource, {
          value: latestValue,
          isTentative: !prebuilt.skipFetch,
          nextDependencies: null,
        });
        if (prebuilt.skipFetch) {
          return loadable;
        }
      }
    } else {
      latestValue = state.cache.loadable.latestValue;
    }

    state.dependencies.forEach((d) => d.unsubscribe());

    const invalidateCache = () => {
      switch (state.cache.state) {
        case "Loading": {
          state.cache.revalidate();
          break;
        }
        case "Fresh": {
          const last = { value: state.cache.loadable.value };
          state.cache = { state: "MaybeStale", loadable: state.cache.loadable };
          state.invalidationListeners.forEach((f) => f({ last }));
          break;
        }
        case "Error":
        case "Stale":
        case "MaybeStale": {
          break;
        }
      }
    };

    const [revalidate, promise] = makeRestartablePromise(async () => {
      const nextDependencies: typeof state.dependencies = [];
      const fetchParams: ResourceFetchParams = {
        get: (key) => {
          const unsubscribe = this.onInvalidate(key, invalidateCache);
          const value = this.getValue(key);
          nextDependencies.push({ key, unsubscribe, lastValue: value });
          return value;
        },
        fetch: (key) => {
          const unsubscribe = this.onInvalidate(key, invalidateCache);
          nextDependencies.push({ key, unsubscribe });
          return this.fetchResource(key).promise();
        },
      };
      const value = await resource.fetch(fetchParams, this.context);
      return [value, nextDependencies] as const;
    });

    const finalPromise = promise
      .then(([value, nextDependencies]) => {
        this.setResourceValue(resource, { value, nextDependencies });
        return value;
      })
      .catch((error) => {
        this.setResourceError(resource, error);
        throw error;
      });

    const loadable = loadableLoading(finalPromise, latestValue);
    state.cache = { state: "Loading", loadable, revalidate };

    return loadable;
  };

  onResourceResultChange = <T>(
    resource: Resource<T>,
    listener: EventListener<ResourceResultChangeEvent<T>>,
  ): Unsubscribe => {
    const state = this.getResourceState(resource);
    state.resourceResultChangeListeners.push(listener);
    return function unsubscribe() {
      state.resourceResultChangeListeners = state.resourceResultChangeListeners.filter((f) => {
        return f !== listener;
      });
    };
  };

  private getResourceState<T>(resource: Resource<T>): ResourceState<T> {
    let state = this.resourceStates.get(resource);
    if (state == null) {
      state = initResourceState();
      this.resourceStates.set(resource, state);
    }
    return state;
  }

  private setResourceValue<T>(
    resource: Resource<T>,
    params: SetResourceValueParams<T>,
  ): LoadableValue<T> {
    resource.setResult(params.value, { get: this.getValue, set: this.setValue }, this.context);
    const state = this.getResourceState(resource);
    const loadable = loadableValue(params.value);
    state.cache = {
      state: params.isTentative ? "Stale" : "Fresh",
      loadable,
    };
    if (params.nextDependencies != null) {
      state.dependencies = params.nextDependencies;
    }
    state.resourceResultChangeListeners.forEach((f) => f({ result: loadable }));
    return loadable;
  }

  private setResourceError<T>(resource: Resource<T>, error: unknown): void {
    const state = this.getResourceState(resource);
    if (state.cache.state === "Loading") {
      const loadable = loadableError<T>(error, state.cache.loadable.latestValue);
      state.cache = {
        state: "Error",
        loadable,
      };
      state.resourceResultChangeListeners.forEach((f) => f({ result: loadable }));
    } else {
      throw new Error(`resource error is set when state is ${state.cache.state}: ${error}`);
    }
  }

  refetchResource = async <T>(
    resource: Resource<T>,
    params: RefetchResourceParams<T>,
  ): Promise<T> => {
    const state = this.getResourceState(resource);

    if (state.cache.state === "Loading") {
      return state.cache.loadable.promise();
    }

    if (state.cache.state === "Fresh" || state.cache.state === "MaybeStale") {
      state.cache = { state: "Stale", loadable: state.cache.loadable };
    }

    const latestValue = this.getCurrentResource(resource)?.latestValue;
    const last = latestValue == null ? null : { value: latestValue };
    state.invalidationListeners.forEach((f) => f({ last }));

    if (latestValue != null && params.preupdate != null) {
      const preupdated = params.preupdate(latestValue);
      this.setResourceValue(resource, {
        value: preupdated,
        isTentative: true,
        nextDependencies: null,
      });
    }

    return this.fetchResource(resource).promise();
  };

  getCurrentResource = <T>(resource: Resource<T>): Loadable<T> | null => {
    return this.getResourceState(resource).cache.loadable;
  };

  private precomputeResourceCacheValidity<T>(state: ResourceState<T>): ResourceCacheState {
    if (state.cache.state !== "MaybeStale") {
      return state.cache.state;
    }
    const allFresh = state.dependencies.every((d) => {
      if (d.key instanceof Resource) {
        // If the dependency is a resource, check its dependencies recursively.
        const st = this.getResourceState(d.key);
        return this.precomputeResourceCacheValidity(st) === "Fresh";
      } else {
        return this.getValue(d.key) === (d as SyncCacheDependency<unknown>).lastValue;
      }
    });
    state.cache = { state: allFresh ? "Fresh" : "Stale", loadable: state.cache.loadable };
    return state.cache.state;
  }

  private precomputeSelectorCacheValidity<T>(state: SelectorState<T>): CacheValidity {
    // When the cache is marked as MaybeStale, check if any of its dependencies have been actually changed.
    // If so, the cache is Stale. Otherwise we can keep using the current cache so mark it as Fresh.
    if (state.cache.state === "MaybeStale") {
      const allFresh = state.dependencies.every((d) => {
        return this.getValue(d.key) === (d as SyncCacheDependency<unknown>).lastValue;
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
    key: Block<T> | Selector<T> | Resource<T>,
    listener: EventListener<ValueInvalidationEvent<T>>,
  ): Unsubscribe => {
    if (key instanceof Block) {
      return this.onBlockChange(key, (event) => {
        listener({ last: { value: event.lastValue } });
      });
    } else if (key instanceof Resource) {
      return this.onResourceCacheInvalidate(key, listener);
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

  onResourceCacheInvalidate = <T>(
    resource: Resource<T>,
    listener: EventListener<ValueInvalidationEvent<T>>,
  ): Unsubscribe => {
    const state = this.getResourceState(resource);
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

  getCacheValue = <T>(selector: CachableKey<T>): { value: T } | null => {
    const { cache } = this.getSelectorState(selector);
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

  delete = (key: Block<any> | Selector<any>): boolean => {
    if (key instanceof Block) {
      return this.deleteBlock(key);
    } else {
      return this.deleteSelector(key);
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
}

export const createStore = (): Store => {
  return new Store();
};
