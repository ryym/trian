import { Block } from './block';
import { Selector, AsyncSelector, StoreKey, GetResult } from './selector';

export interface BlockState<T> {
  current: T;
  changeListeners: SetValue<T>[];
}

export interface SelectorState<T> {
  cache: { value: T } | null;
  updating: { depsChanged: boolean } | null;
  invalidationListeners: Array<() => void>;
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
        state.invalidationListeners.forEach((f) => f());
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
        state.invalidationListeners.forEach((f) => f());
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
      state = { cache: null, updating: null, invalidationListeners: [], dependencies: [] };
      this.selectorStates.set(selector, state);
    }
    return state;
  }

  onInvalidate = (key: StoreKey<any>, listener: () => void): Unsubscribe => {
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

  getCacheValue = <T>(selector: Selector<T> | AsyncSelector<T>): T | undefined => {
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
