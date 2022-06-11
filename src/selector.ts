import { Block, Comparer } from "./block";

export type Get = <T>(selector: Block<T> | Selector<T>) => T;

export interface SelectorFnParams {
  readonly get: Get;
}

export type SelectorFn<T> = (params: SelectorFnParams) => T;

export interface SelectorCacheInvalidateEvent<T> {
  readonly last: null | { value: T };
}

export interface SelectorDeletionEvent<T> {
  readonly last: null | { value: T };
}

export interface SelectorConfig<T> {
  readonly name?: string;
  readonly get: SelectorFn<T>;
  readonly isSame?: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;
  readonly onDelete?: (event: SelectorDeletionEvent<T>) => void;
}

export class Selector<T> {
  readonly name?: string;
  private readonly fn: SelectorFn<T>;
  readonly isSame: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;
  readonly onDelete?: (event: SelectorDeletionEvent<T>) => void;

  constructor(config: SelectorConfig<T>) {
    this.name = config.name;
    this.fn = config.get;
    this.isSame = config.isSame || Object.is;
    this.onCacheInvalidate = config.onCacheInvalidate;
    this.onDelete = config.onDelete;
  }

  run(params: SelectorFnParams): T {
    return this.fn(params);
  }
}

export const selector = <T>(config: SelectorConfig<T>): Selector<T> => {
  return new Selector(config);
};
