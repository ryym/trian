import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  createElement,
  ReactNode,
} from 'react';
import { Block, Selector, Store, Dispatch, Unsubscribe, createDispatch } from './index';
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
  const unsubscribe = useRef<Unsubscribe | undefined>(undefined);
  const [value, setValue] = useState(store.getValue(key));

  // We use useRef instead of useEffect for state change subscription
  // to support autoClear feature properly.
  // Say there are two components A and B, and they uses the same block.
  // If the parent component replaces A with B, the things happen in the following order:
  //   1. B's useBlock is called.
  //   2. A's unsubscribe is called (in useEffect).
  //   3. B's subscribe is called (in useEffect)
  // This makes difficult to keep or clear the block state if the block is used by only A and B.
  // When 1 B's useBlock sets the current state as initial value
  // but when 2 it clears the current state if autoClear is set.
  if (unsubscribe.current === undefined) {
    unsubscribe.current = store.onInvalidate(key, () => {
      setValue(store.getValue(key));
    });
  }

  useEffect(() => unsubscribe.current, []);

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

  const unsubscribe = useRef<Unsubscribe | undefined>(undefined);
  if (unsubscribe.current === undefined) {
    unsubscribe.current = store.onInvalidate(selector, () => {
      setResult((result) => {
        const lastValue = result.status === 'Done' ? result.value : undefined;
        return { status: 'Loading', loading: true, value: lastValue };
      });
    });
  }
  useEffect(() => unsubscribe.current, []);

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
