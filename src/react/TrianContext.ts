import { createContext, useContext, createElement, useMemo } from "react";
import type { ReactNode, FunctionComponentElement, ProviderProps } from "react";
import { Dispatch, createDispatch } from "../dispatch";
import { Store } from "../store";

export interface TrianContextValue {
  readonly store: Store;
  readonly dispatch: Dispatch;
}

const TrianContext = createContext<TrianContextValue | null>(null);

export interface TrianProviderProps {
  readonly store: Store;
  readonly dispatch?: Dispatch;
  readonly children?: ReactNode;
}

type TrianProviderType = FunctionComponentElement<ProviderProps<TrianContextValue | null>>;

export const TrianProvider = (props: TrianProviderProps): TrianProviderType => {
  // Keep the referential equality of context value to avoid unnecessary re-rendering.
  // Without this, all components using `useTrianContext` are re-rendered when TrianProvider is re-rendered.
  const contextValue: TrianContextValue = useMemo(() => {
    const dispatch = props.dispatch || createDispatch(props.store);
    return { store: props.store, dispatch };
  }, [props.store, props.dispatch]);

  return createElement(TrianContext.Provider, { value: contextValue }, props.children);
};

export const useTrianContext = (): TrianContextValue => {
  const ctx = useContext(TrianContext);
  if (ctx == null) {
    throw new Error("[trian] Store not found. Please wrap your component tree by TrianProvider");
  }
  return ctx;
};
