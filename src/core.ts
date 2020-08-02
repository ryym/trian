export interface BlockState<T> {
  current: T;
  subscribers: SetValue<T>[];
}

export type SetValue<T> = (value: T) => void;

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export interface BlockConfig<T> {
  // In future we make it possible to specify the argument for this factory via TrianProvider.
  // This enables us to create an initial value dynamically based on the rendering context.
  readonly default: () => T;

  // If this is true, it lets the store clear the block state
  // when all components stop its subscription for this block.
  readonly autoClear?: boolean;
}

export class Block<T> {
  readonly default: () => T;
  readonly autoClear: boolean;

  constructor(config: BlockConfig<T>) {
    this.default = config.default;
    this.autoClear = config.autoClear || false;
  }
}

export const createBlock = <T>(config: BlockConfig<T>): Block<T> => {
  return new Block(config);
};

export class Store {
  private readonly states: Map<Block<any>, BlockState<any>> = new Map();

  private getBlockState<T>(block: Block<T>): BlockState<T> {
    let state = this.states.get(block);
    if (state == null) {
      state = { current: block.default(), subscribers: [] };
      this.states.set(block, state);
    }
    return state;
  }

  subscribe = <T>(block: Block<T>, setValue: SetValue<T>): Unsubscribe => {
    const state = this.getBlockState(block);
    state.subscribers.push(setValue);

    const unsubscribe = () => {
      state.subscribers = state.subscribers.filter((sb) => sb !== setValue);
      if (block.autoClear && state.subscribers.length === 0) {
        this.states.delete(block);
      }
    };
    return unsubscribe;
  };

  getValue = <T>(block: Block<T>): T => {
    return this.getBlockState(block).current;
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

export const createDispatch = (store: Store): Dispatch => {
  function dispatch<As extends any[], R>(action: Action<As, R>, ...args: As): R {
    return action(params, ...args);
  }

  const params: StoreAccess = {
    update: store.updateValue,
    dispatch,
  };

  return dispatch;
};

export interface Dispatch {
  <As extends any[], R>(action: Action<As, R>, ...args: As): R;
}

export interface StoreAccess {
  update<T>(block: Block<T>, update: UpdateValue<T>): void;
  dispatch<As extends any[], R>(action: Action<As, R>, ...args: As): R;
}

export interface Action<Args extends any[], Result> {
  (acc: StoreAccess, ...args: Args): Result;
}

export const createStore = () => {
  return new Store();
};
