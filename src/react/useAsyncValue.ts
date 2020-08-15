import { useState, useEffect } from 'react';
import { useTrianContext } from './context';
import { AsyncSelector } from '../selector';

export type AsyncResult<T> =
  | {
      status: 'Loading';
      loading: true;
      value?: T;
    }
  | {
      status: 'Done';
      value: T;
      loading: false;
    }
  | {
      status: 'Error';
      error: any;
      value: undefined;
      loading: false;
    };

export const useAsyncValue = <T>(selector: AsyncSelector<T>): AsyncResult<T> => {
  const { store } = useTrianContext();

  const [result, setResult] = useState<AsyncResult<T>>(() => {
    const cache = store.getCacheValue(selector);
    return cache != null
      ? { status: 'Done', value: cache.value, loading: false }
      : { status: 'Loading', loading: true };
  });

  useEffect(() => {
    const unsubscribe = store.onInvalidate(selector, () => {
      setResult((result) => {
        const lastValue = result.status === 'Done' ? result.value : undefined;
        return { status: 'Loading', loading: true, value: lastValue };
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!result.loading) {
      return;
    }
    store
      .getAsyncValue(selector)
      .then((value) => setResult({ status: 'Done', value, loading: false }))
      .catch((error) => setResult({ status: 'Error', error, loading: false, value: undefined }));
  }, [result.loading]);

  return result;
};
