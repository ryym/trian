export type Loadable<T> = LoadableLoading<T> | LoadableResult<T>;

export type LoadableResult<T> = LoadableValue<T> | LoadableError<T>;

interface LoadableBase<T> {
  readonly state: "loading" | "hasValue" | "hasError";
  readonly promise: () => Promise<T>;
}

export interface LoadableLoading<T> extends LoadableBase<T> {
  readonly state: "loading";
  readonly prebuilt: T | undefined;
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
  prebuilt: T | undefined,
): LoadableLoading<T> => {
  return {
    state: "loading",
    promise: () => promise,
    prebuilt,
  };
};

export const loadableValue = <T>(value: T): LoadableValue<T> => {
  return {
    state: "hasValue",
    promise: () => Promise.resolve(value),
    value,
  };
};

export const loadableError = <T>(error: unknown): LoadableError<T> => {
  return {
    state: "hasError",
    promise: () => Promise.reject(error),
    error,
  };
};
