import { useState, useEffect } from "react";
import { useTrianContext } from "./context";
import { Block } from "../block";
import { Selector } from "../selector";

export const useValue = <T>(passedKey: Block<T> | Selector<T>): T => {
  const { store } = useTrianContext();
  const [key] = useState(passedKey);

  const [value, setValue] = useState(store.getValue(key));

  useEffect(() => {
    const unsubscribe = store.onInvalidate(key, (event) => {
      const value = store.getValue(key);
      if (event.last == null || event.last.value !== value) {
        setValue(value);
      }
    });
    return unsubscribe;
  }, []);

  return value;
};
