import { Block } from './block';
import { Selector, AsyncSelector, StoreKey, GetResult } from './selector';

export interface BlockState<T> {
  current: T;
  subscribers: SetValue<T>[];
}

export interface SelectorState<T> {
  cache: { value: T } | null;
  updating: { depsChanged: boolean } | null;
  invalidationHandlers: Array<() => void>;
  dependencies: Array<{ unsubscribe: Unsubscribe }>;
}

export type SetValue<T> = (value: T) => void;

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export class Store<BlockCtx> {
  private readonly blockStates: Map<Block<any>, BlockState<any>> = new Map();

  private readonly blockContext: BlockCtx;

  private readonly selectorStates: Map<
    Selector<any> | AsyncSelector<any>,
    SelectorState<any>
  > = new Map();

  constructor(blockContext: BlockCtx) {
    this.blockContext = blockContext;
  }

  private getBlockState<T>(block: Block<T>): BlockState<T> {
    let state = this.blockStates.get(block);
    if (state == null) {
      state = { current: block.default(this.blockContext), subscribers: [] };
      this.blockStates.set(block, state);
    }
    return state;
  }

  // TODO: Rename method to onBlockValueChange.
  subscribe = <T>(block: Block<T>, setValue: SetValue<T>): Unsubscribe => {
    const state = this.getBlockState(block);
    state.subscribers.push(setValue);

    const unsubscribe = () => {
      state.subscribers = state.subscribers.filter((sb) => sb !== setValue);
      if (block.autoClear && state.subscribers.length === 0) {
        this.blockStates.delete(block);
      }
    };
    return unsubscribe;
  };

  // TODO: Remove method in favor of selectValue.
  getValue = <T>(block: Block<T>): T => {
    return this.getBlockState(block).current;
  };

  selectValue = <K extends StoreKey<any>>(key: K): GetResult<K> => {
    if (key instanceof Block) {
      return this.getBlockValue(key);
    } else if (key instanceof Selector) {
      return this.getSelectorValue(key as any);
    } else if (key instanceof AsyncSelector) {
      return this.getAsyncSelectorValue(key as any) as GetResult<K>;
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
        state.invalidationHandlers.forEach((h) => h());
      }
    };

    const get = <U>(key: Block<U> | Selector<U>): U => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      return this.selectValue(key);
    };

    const value = selector.run({ get });
    state.cache = { value };
    return state.cache.value;
  };

  private getAsyncSelectorValue = async <T>(selector: AsyncSelector<T>): Promise<T> => {
    const state = this.getSelectorState(selector);
    if (state.cache) {
      return Promise.resolve(state.cache.value);
    }

    state.dependencies.forEach((d) => d.unsubscribe());
    state.dependencies = [];

    const invalidateCache = () => {
      if (state.cache != null) {
        state.cache = null;
        state.invalidationHandlers.forEach((h) => h());
      }
      if (state.updating != null) {
        state.updating.depsChanged = true;
      }
    };

    const get = <K extends StoreKey<any>>(key: K): GetResult<K> => {
      const unsubscribe = this.onInvalidate(key, invalidateCache);
      state.dependencies.push({ unsubscribe });
      return this.selectValue(key);
    };

    state.updating = { depsChanged: false };
    const value = await selector.run({ get });
    if (!state.updating.depsChanged) {
      state.cache = { value };
    }
    state.updating = null;
    return value;
  };

  private getSelectorState<T>(selector: Selector<T> | AsyncSelector<T>): SelectorState<T> {
    let state = this.selectorStates.get(selector);
    if (state == null) {
      state = { cache: null, updating: null, invalidationHandlers: [], dependencies: [] };
      this.selectorStates.set(selector, state);
    }
    return state;
  }

  onInvalidate = (key: StoreKey<any>, handler: () => void): Unsubscribe => {
    if (key instanceof Block) {
      return this.subscribe(key, handler);
    } else {
      const state = this.getSelectorState(key);
      state.invalidationHandlers.push(handler);
      return function unsubscribe() {
        state.invalidationHandlers = state.invalidationHandlers.filter((f) => f !== handler);
      };
    }
  };

  setValue = <T>(block: Block<T>, value: T): void => {
    const state = this.getBlockState(block);
    state.current = value;
    state.subscribers.forEach((sb) => sb(value));
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
