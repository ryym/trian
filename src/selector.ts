import { Block, Comparer } from "./block";

export type AnySelector<T> = Selector<T> | AsyncSelector<T>;

export type Get = <T>(selector: Block<T> | Selector<T>) => T;

export interface SelectorFnParams {
  readonly get: Get;
}

export type SelectorFn<T> = (params: SelectorFnParams) => T;

export type SelectorCacheInvalidateEvent<T> = {
  last: null | { value: T };
  removed?: boolean;
};

export interface SelectorConfig<T> {
  readonly name?: string;
  readonly get: SelectorFn<T>;
  readonly isSame?: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;
}

export class Selector<T> {
  readonly name?: string;
  private readonly fn: SelectorFn<T>;
  readonly isSame: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;

  constructor(config: SelectorConfig<T>) {
    this.name = config.name;
    this.fn = config.get;
    this.isSame = config.isSame || Object.is;
    this.onCacheInvalidate = config.onCacheInvalidate;
  }

  run(params: SelectorFnParams): T {
    return this.fn(params);
  }
}

export type AnyGet = <K extends AnyGetKey<any>>(selector: K) => AnyGetResult<K>;

export type AnyGetKey<T> = Block<T> | Selector<T> | AsyncSelector<T>;

export type AnyGetResult<K extends AnyGetKey<any>> = K extends AsyncSelector<infer T>
  ? Promise<T>
  : K extends AnyGetKey<infer T>
  ? T
  : never;

export interface AsyncSelectorFnParams {
  readonly get: AnyGet;
}

export type AsyncSelectorFn<T> = (params: AsyncSelectorFnParams) => Promise<T>;

export interface AsyncSelectorConfig<T> {
  readonly name?: string;
  readonly get: AsyncSelectorFn<T>;
  readonly isSame?: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;
}

export class AsyncSelector<T> {
  readonly name?: string;
  private readonly fn: AsyncSelectorFn<T>;
  readonly isSame: Comparer<T>;
  readonly onCacheInvalidate?: (event: SelectorCacheInvalidateEvent<T>) => void;

  constructor(config: AsyncSelectorConfig<T>) {
    this.name = config.name;
    this.fn = config.get;
    this.isSame = config.isSame || Object.is;
    this.onCacheInvalidate = config.onCacheInvalidate;
  }

  run(params: AsyncSelectorFnParams): Promise<T> {
    return this.fn(params);
  }
}

export interface NewSelector {
  <T>(config: SelectorConfig<T>): T extends Promise<any> ? never : Selector<T>;
  async<T>(config: AsyncSelectorConfig<T>): AsyncSelector<T>;
}

const createSelectorCreator = (): NewSelector => {
  const selector = (<T>(config: SelectorConfig<T>): Selector<T> => {
    return new Selector(config);
  }) as NewSelector;

  const asyncSelector = <T>(config: AsyncSelectorConfig<T>): AsyncSelector<T> => {
    return new AsyncSelector(config);
  };

  selector.async = asyncSelector;

  return selector;
};

export const selector = createSelectorCreator();
