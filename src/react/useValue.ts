import { useState, useEffect } from 'react';
import { useTrianContext } from './context';
import { Block } from '../block';
import { Selector } from '../selector';

export const useValue = <T>(key: Block<T> | Selector<T>): T => {
  const { store } = useTrianContext();
  const [value, setValue] = useState(store.getValue(key));

  useEffect(() => {
    const unsubscribe = store.onInvalidate(key, () => {
      setValue(store.getValue(key));
    });
    return unsubscribe;
  }, []);

  return value;
};
