import { useSyncExternalStore, useCallback } from "react";
import { useTrianContext } from "./TrianContext";
import { Block } from "../block";
import { Selector } from "../selector";

export const useValue = <T>(key: Block<T> | Selector<T>): T => {
  const { store } = useTrianContext();
  return useSyncExternalStore(
    useCallback(
      (callback) => {
        return store.onInvalidate(key, callback);
      },
      [store, key],
    ),
    useCallback(() => store.getValue(key), [store, key]),
  );
};
