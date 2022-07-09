import { useState } from "react";
import { useTrianContext } from "./context";
import { Loader } from "../loader";

export const useResolvedValue = <T>(passedLoader: Loader<T>): T => {
  const { store } = useTrianContext();
  const [loader] = useState(passedLoader);

  const result = store.getSettledAsyncResult(loader);
  if (result == null) {
    throw store.getAsyncValue(loader);
  }
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
};
