export interface BlockState<T> {
  current: T;
  subscribers: SetValue<T>[];
}

export type SetValue<T> = (value: T) => void;

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export interface BlockConfig<T> {
  readonly key: string;
  readonly default: T;
}

export class Block<T> {
  readonly key: string;
  readonly default: T;

  constructor(key: string, defaultValue: T) {
    this.key = key;
    this.default = defaultValue;
  }
}

export const createBlock = <T>({ key, default: defaultValue }: BlockConfig<T>): Block<T> => {
  return new Block(key, defaultValue);
};

export class Store {
  private readonly states: Map<string, BlockState<any>> = new Map();

  private getBlockState<T>(block: Block<T>): BlockState<T> {
    let state = this.states.get(block.key);
    if (state == null) {
      state = { current: block.default, subscribers: [] };
      this.states.set(block.key, state);
    }
    return state;
  }

  subscribe = <T>(block: Block<T>, setValue: SetValue<T>): Unsubscribe => {
    const state = this.getBlockState(block);
    state.subscribers.push(setValue);
    return function unsubscribe() {
      state.subscribers = state.subscribers.filter((sb) => sb !== setValue);
    };
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

  dispatch = <As extends any[], R>(action: Action<As, R>, ...args: As): R => {
    const access = this.getAccess();
    return action(access, ...args);
  };

  getAccess = (): StoreAccess => {
    return {
      update: this.updateValue,
      dispatch: this.dispatch,
    };
  };
}

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
