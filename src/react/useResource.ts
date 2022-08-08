import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useTrianContext } from "./TrianContext";
import { Resource } from "../resource";
import { Loadable } from "../loadable";

export const useResource = <T>(resource: Resource<T>): Loadable<T> => {
  const { store } = useTrianContext();

  const getSnapshot = useCallback(() => {
    return store.getCurrentResource(resource) || store.fetchResource(resource);
  }, [store, resource]);

  const loadable = useSyncExternalStore(
    useCallback(
      (callback) => {
        return store.onResourceResultChange(resource, callback);
      },
      [store, resource],
    ),
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    const unsubscribe = store.onInvalidate(resource, () => {
      store.fetchResource(resource);
    });
    return unsubscribe;
  }, [store, resource]);

  return loadable;
};
