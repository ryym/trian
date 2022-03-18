import { Store, UpdateValue } from "./store";
import { Block } from "./block";
import { AnyGet, AnyGetKey } from "./selector";

export const createDispatch = <Ctx>(store: Store<any>, ctx: Ctx): Dispatch<Ctx> => {
  function dispatch<As extends unknown[], R>(action: Action<As, R, Ctx>, ...args: As): R {
    return action(...args)(params, ctx);
  }

  const params: ThunkParams<Ctx> = {
    get: store.getAnyValue,
    set: store.setValue,
    remove: store.remove,
    dispatch,
  };

  return dispatch;
};

export interface Dispatch<Ctx> {
  <As extends unknown[], R>(action: Action<As, R, Ctx>, ...args: As): R;
}

export interface Action<Args extends unknown[], Result, Ctx = unknown> {
  (...args: Args): Thunk<Result, Ctx>;
}

export interface ThunkParams<Ctx> {
  get: AnyGet;
  set<T>(block: Block<T>, next: T | UpdateValue<T>): void;
  remove(key: AnyGetKey<any>): void;
  dispatch<As extends unknown[], R>(action: Action<As, R, Ctx>, ...args: As): R;
}

export interface Thunk<Result = void, Ctx = unknown> {
  (params: ThunkParams<Ctx>, context: Ctx): Result;
}
