import { Store, UpdateValue } from "./store";
import { Block } from "./block";
import { AnyGet, AnyGetKey } from "./loader";
import { Context } from "./context";

export const createDispatch = (store: Store): Dispatch => {
  function dispatch<As extends unknown[], R>(action: Action<As, R>, ...args: As): R {
    return action(...args)(params, store.context);
  }

  const params: ThunkParams = {
    get: store.getAnyValue,
    set: store.setValue,
    delete: store.delete,
    dispatch,
  };

  return dispatch;
};

export interface Dispatch {
  <As extends unknown[], R>(action: Action<As, R>, ...args: As): R;
}

export interface Action<Args extends unknown[], Result> {
  (...args: Args): Thunk<Result>;
}

export interface ThunkParams {
  get: AnyGet;
  set<T>(block: Block<T>, next: T | UpdateValue<T>): void;
  delete(key: AnyGetKey<any>): boolean;
  dispatch<As extends unknown[], R>(action: Action<As, R>, ...args: As): R;
}

export interface Thunk<Result = void> {
  (params: ThunkParams, context: Context): Result;
}
