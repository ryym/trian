export type Loadable<T> = LoadableLoading<T> | LoadableResult<T>;

export type LoadableResult<T> = LoadableValue<T> | LoadableError<T>;

interface LoadableBase<T> {
  readonly state: "loading" | "hasValue" | "hasError";
  readonly promise: () => Promise<T>;
  readonly latestValue: T | undefined;
}

export interface LoadableLoading<T> extends LoadableBase<T> {
  readonly state: "loading";
}

export interface LoadableValue<T> extends LoadableBase<T> {
  readonly state: "hasValue";
  readonly value: T;
}

export interface LoadableError<T> extends LoadableBase<T> {
  readonly state: "hasError";
  readonly error: unknown;
}

export const loadableLoading = <T>(
  promise: Promise<T>,
  latestValue: T | undefined,
): LoadableLoading<T> => {
  return {
    state: "loading",
    promise: () => promise,
    latestValue,
  };
};

export const loadableValue = <T>(value: T): LoadableValue<T> => {
  return {
    state: "hasValue",
    promise: () => Promise.resolve(value),
    value,
    latestValue: value,
  };
};

export const loadableError = <T>(error: unknown, latestValue: T | undefined): LoadableError<T> => {
  return {
    state: "hasError",
    promise: () => Promise.reject(error),
    error,
    latestValue,
  };
};
