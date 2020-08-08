import { createContext, useContext, useState, useEffect, createElement, ReactNode } from 'react';
import { Block, Selector, Store, Dispatch, createDispatch } from './index';
import { AsyncSelector } from './selector';

export interface TrianContextValue<Ctx> {
  readonly store: Store<any>;
  readonly dispatch: Dispatch<Ctx>;
}

const TrianContext = createContext<TrianContextValue<any> | null>(null);

export interface TrianProviderProps {
  readonly store: Store<any>;
  readonly dispatch?: Dispatch<any>;
  readonly children?: ReactNode;
}

export const TrianProvider = ({ store, dispatch, children }: TrianProviderProps) => {
  dispatch = dispatch ?? createDispatch(store, undefined);
  return createElement(TrianContext.Provider, { value: { store, dispatch } }, children);
};

export const useTrianContext = <Ctx>(): TrianContextValue<Ctx> => {
  const ctx = useContext(TrianContext);
  if (ctx == null) {
    throw new Error('[trian] Store not found. Please wrap your component tree by TrianProvider');
  }
  return ctx;
};

export const useValue = <T>(key: Block<T> | Selector<T>): T => {
  const { store } = useTrianContext();
  const [value, setValue] = useState(store.getValue(key));

  useEffect(() => {
    const unsubscribe = store.onInvalidate(key, () => {
      setValue(store.getValue(key));
    });
    return unsubscribe;
  }, []);

  return value;
};

export type AsyncResult<T> =
  | {
      status: 'Loading';
      loading: true;
      value?: T;
    }
  | {
      status: 'Done';
      value: T;
      loading: false;
    }
  | {
      status: 'Error';
      error: any;
      value: undefined;
      loading: false;
    };

export const useAsyncValue = <T>(selector: AsyncSelector<T>): AsyncResult<T> => {
  const { store } = useTrianContext();

  const [result, setResult] = useState<AsyncResult<T>>(() => {
    const cache = store.getCacheValue(selector);
    return cache != null
      ? { status: 'Done', value: cache, loading: false }
      : { status: 'Loading', loading: true };
  });

  useEffect(() => {
    const unsubscribe = store.onInvalidate(selector, () => {
      setResult((result) => {
        const lastValue = result.status === 'Done' ? result.value : undefined;
        return { status: 'Loading', loading: true, value: lastValue };
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!result.loading) {
      return;
    }
    store
      .getAsyncValue(selector)
      .then((value) => setResult({ status: 'Done', value, loading: false }))
      .catch((error) => setResult({ status: 'Error', error, loading: false, value: undefined }));
  }, [result.loading]);

  return result;
};

export const useDispatch = <Ctx = any>(): Dispatch<Ctx> => {
  const { dispatch } = useTrianContext<Ctx>();
  return dispatch;
};
