import { Store, UpdateValue } from './store';
import { Block } from './block';

export const createDispatch = <Ctx>(store: Store<any>, ctx: Ctx): Dispatch<Ctx> => {
  function dispatch<As extends any[], R>(action: Action<As, R, Ctx>, ...args: As): R {
    return action(...args)(params, ctx);
  }

  const params: ThunkParams<Ctx> = {
    update: store.updateValue,
    dispatch,
  };

  return dispatch;
};

export interface Dispatch<Ctx> {
  <As extends any[], R>(action: Action<As, R, Ctx>, ...args: As): R;
}

export interface Action<Args extends any[], Result, Ctx = unknown> {
  (...args: Args): Thunk<Result, Ctx>;
}

export interface ThunkParams<Ctx> {
  update<T>(block: Block<T>, update: UpdateValue<T>): void;
  dispatch<As extends any[], R>(action: Action<As, R, Ctx>, ...args: As): R;
}

export interface Thunk<Result = void, Ctx = unknown> {
  (params: ThunkParams<Ctx>, context: Ctx): Result;
}
