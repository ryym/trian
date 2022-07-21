import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import { useTrianContext } from "./TrianContext";
import { Block } from "../block";
import { Selector } from "../selector";

// export const useValue = <T>(passedKey: Block<T> | Selector<T>): T => {
//   const { store } = useTrianContext();
//   const [key] = useState(passedKey);

//   const [value, setValue] = useState(store.getValue(key));

//   useEffect(() => {
//     const unsubscribe = store.onInvalidate(key, (event) => {
//       const value = store.getValue(key);
//       if (event.last == null || event.last.value !== value) {
//         setValue(value);
//       }
//     });
//     return unsubscribe;
//   }, []);

//   return value;
// };

export const useValue = <T>(key: Block<T> | Selector<T>): T => {
  const { store } = useTrianContext();
  return useSyncExternalStore(
    useCallback((callback) => store.onInvalidate(key, callback), [store, key]),
    useCallback(() => store.getValue(key), [store, key]),
  );
};
