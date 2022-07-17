import { useEffect, useState } from "react";
import { useTrianContext } from "./TrianContext";
import { Loader } from "../loader";

export const useResolvedValue = <T>(passedLoader: Loader<T>): T => {
  const { store } = useTrianContext();
  const [loader] = useState(passedLoader);

  const [result, setResult] = useState(() => store.getSettledAsyncResult(loader));
  if (result == null) {
    throw store.getAsyncValue(loader);
  }
  if (!result.ok) {
    throw result.error;
  }

  useEffect(() => {
    const unsubscribe = store.onInvalidate(loader, () => {
      store
        .getAsyncValue(loader)
        .catch(() => {})
        .then(() => {
          setResult(store.getSettledAsyncResult(loader));
        });
    });
    return unsubscribe;
  }, []);

  return result.value;
};
