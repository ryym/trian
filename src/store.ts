import { Block } from './block';

export interface BlockState<T> {
  current: T;
  subscribers: SetValue<T>[];
}

export type SetValue<T> = (value: T) => void;

export type UpdateValue<T> = (value: T) => T;

export type Unsubscribe = () => void;

export class Store<BlockCtx> {
  private readonly blockStates: Map<Block<any>, BlockState<any>> = new Map();
  private readonly blockContext: BlockCtx;

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

export const createStore = <BlockCtx = undefined>(blockCtx?: BlockCtx) => {
  return new Store(blockCtx);
};
