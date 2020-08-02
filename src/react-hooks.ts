import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  createElement,
  ReactNode,
} from 'react';
import { Block, Store, Dispatch, Unsubscribe } from './index';

const TrianContext = createContext<Store | null>(null);

export interface TrianProviderProps {
  readonly store: Store;
  readonly children?: ReactNode;
}

export const TrianProvider = ({ store, children }: TrianProviderProps) => {
  return createElement(TrianContext.Provider, { value: store }, children);
};

export const useStore = (): Store => {
  const store = useContext(TrianContext);
  if (store == null) {
    throw new Error('[trian] Store not found. Please wrap your component tree by TrianProvider');
  }
  return store;
};

export const useBlock = <T>(block: Block<T>): T => {
  const store = useStore();
  const unsubscribe = useRef<Unsubscribe | undefined>(undefined);

  const currentValue = store.getValue(block);
  const [value, setValue] = useState(currentValue);

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
    unsubscribe.current = store.subscribe(block, setValue);
  }

  useEffect(() => unsubscribe.current, []);

  return value;
};

export const useDispatch = (): Dispatch => {
  const store = useStore();
  return store.dispatch;
};
