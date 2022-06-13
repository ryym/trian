import { useState } from "react";
import { useTrianContext } from "./context";
import { Loader } from "../loader";

export const useResolvedValue = <T>(passedLoader: Loader<T>): T => {
  const { store } = useTrianContext();
  const [loader] = useState(passedLoader);
  const cache = store.getCacheValue(loader);
  if (cache == null) {
    throw store.getAsyncValue(loader);
  }
  return cache.value;
};
