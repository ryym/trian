import { Store, UpdateValue } from './store';
import { Block } from './block';
import { AnyGet, AnyGetKey } from './selector';

export const createDispatch = <Ctx>(store: Store<any>, ctx: Ctx): Dispatch<Ctx> => {
  function dispatch<As extends any[], R>(action: Action<As, R, Ctx>, ...args: As): R {
    return action(...args)(params, ctx);
  }

  const params: ThunkParams<Ctx> = {
    get: store.getAnyValue,
    update: store.updateValue,
    remove: store.remove,
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
  get: AnyGet;
  update<T>(block: Block<T>, update: UpdateValue<T>): void;
  remove(key: AnyGetKey<any>): void;
  dispatch<As extends any[], R>(action: Action<As, R, Ctx>, ...args: As): R;
}

export interface Thunk<Result = void, Ctx = unknown> {
  (params: ThunkParams<Ctx>, context: Ctx): Result;
}
