import { createContext, useContext, createElement, useMemo } from "react";
import type { ReactNode, FunctionComponentElement, ProviderProps } from "react";
import { Dispatch, createDispatch } from "../dispatch";
import { Store } from "../store";

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

type TrianProviderType = FunctionComponentElement<ProviderProps<TrianContextValue<any> | null>>;

export const TrianProvider = (props: TrianProviderProps): TrianProviderType => {
  // Keep the referential equality of context value to avoid unnecessary re-rendering.
  // Without this, all components using `useTrianContext` are re-rendered when TrianProvider is re-rendered.
  const contextValue: TrianContextValue<unknown> = useMemo(() => {
    const dispatch = props.dispatch || createDispatch(props.store, undefined);
    return { store: props.store, dispatch };
  }, [props.store, props.dispatch]);

  return createElement(TrianContext.Provider, { value: contextValue }, props.children);
};

export const useTrianContext = <Ctx>(): TrianContextValue<Ctx> => {
  const ctx = useContext(TrianContext);
  if (ctx == null) {
    throw new Error("[trian] Store not found. Please wrap your component tree by TrianProvider");
  }
  return ctx;
};
