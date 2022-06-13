import { useState, useEffect } from "react";
import { useTrianContext } from "./context";
import { Loader } from "../loader";

export type AsyncResult<T> =
  | {
      status: "Loading";
      loading: true;
      value: T | undefined;
      error?: undefined;
    }
  | {
      status: "Done";
      loading: false;
      value: T;
      error?: undefined;
    }
  | {
      status: "Error";
      loading: false;
      value: undefined;
      error: unknown;
    };

export const useAsyncValue = <T>(passedLoader: Loader<T>): AsyncResult<T> => {
  const { store } = useTrianContext();
  const [loader] = useState(passedLoader);

  const [result, setResult] = useState<AsyncResult<T>>(() => {
    const cache = store.getCacheValue(loader);
    return cache != null
      ? { status: "Done", value: cache.value, loading: false }
      : { status: "Loading", value: undefined, loading: true };
  });

  useEffect(() => {
    const unsubscribe = store.onInvalidate(loader, () => {
      if (!store._willRecomputeOnGet(loader)) {
        return;
      }
      setResult((result) => {
        const lastValue = result.status === "Done" ? result.value : undefined;
        return { status: "Loading", loading: true, value: lastValue };
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!result.loading) {
      return;
    }
    store
      .getAsyncValue(loader)
      .then((value) => setResult({ status: "Done", value, loading: false }))
      .catch((error) => setResult({ status: "Error", error, loading: false, value: undefined }));
  }, [result.loading]);

  return result;
};
