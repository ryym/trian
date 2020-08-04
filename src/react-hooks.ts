import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  createElement,
  ReactNode,
} from 'react';
import { Block, Store, Dispatch, Unsubscribe, createDispatch } from './index';

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

const useNotifier = (): (() => void) => {
  const [, update] = useState(0);
  return function notify() {
    update((n) => (n + 1) % 100);
  };
};

export const useBlock = <T>(block: Block<T>): T => {
  const { store } = useTrianContext();
  const unsubscribe = useRef<Unsubscribe | undefined>(undefined);
  const notify = useNotifier();

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
    unsubscribe.current = store.onInvalidate(block, notify);
  }

  useEffect(() => unsubscribe.current, []);

  return store.selectValue(block);
};

export const useDispatch = <Ctx = any>(): Dispatch<Ctx> => {
  const { dispatch } = useTrianContext<Ctx>();
  return dispatch;
};
