import { createContext, useContext, useState, useEffect, createElement, ReactNode } from 'react';
import { Block, Store, Dispatch } from './index';

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

  const currentValue = store.getValue(block);
  const [value, setValue] = useState(currentValue);

  useEffect(() => {
    return store.subscribe(block, setValue);
  }, []);

  return value;
};

export const useDispatch = (): Dispatch => {
  const store = useStore();
  return store.dispatch;
};
