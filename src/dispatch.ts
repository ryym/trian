import { Store } from "./store";
import { Context } from "./context";

export const createDispatch = (store: Store): Dispatch => {
  function dispatch<As extends unknown[], R>(action: Action<As, R>, ...args: As): R {
    return action(...args)(params, store.context);
  }

  const params: ThunkParams = {
    get: store.getAnyValue,
    fetch: store.fetchResource,
    refetch: store.refetchResource,
    set: store.setValue,
    delete: store.delete,
    dispatch,
  };

  return dispatch;
};

export interface ThunkParams {
  readonly get: Store["getAnyValue"];
  readonly fetch: Store["fetchResource"];
  readonly refetch: Store["refetchResource"];
  readonly set: Store["setValue"];
  readonly delete: Store["delete"];
  readonly dispatch: Dispatch;
}

export type Dispatch = <As extends unknown[], R>(action: Action<As, R>, ...args: As) => R;

export type Action<Args extends unknown[], Result> = (...args: Args) => Thunk<Result>;

export type Thunk<Result = void> = (params: ThunkParams, context: Context) => Result;
