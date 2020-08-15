import { createContext, useContext, createElement, ReactNode } from 'react';
import { Dispatch, createDispatch } from '../dispatch';
import { Store } from '../store';

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
