import { useState, useEffect } from "react";
import { useTrianContext } from "./context";
import { Block } from "../block";
import { Loader } from "../loader";

export const useSetInitialValue = <T>(
  passedKey: Block<T> | Loader<T>,
  initialValue: () => T,
): boolean => {
  const { store } = useTrianContext();
  const [key] = useState(passedKey);
  return store.trySetInitialValue(key, initialValue);
};
