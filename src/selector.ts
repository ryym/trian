import { Block } from './block';

export type StoreKey<T> = Block<T> | Selector<T> | AsyncSelector<T>;

export type GetResult<K extends StoreKey<any>> = K extends AsyncSelector<infer T>
  ? Promise<T>
  : K extends StoreKey<infer T>
  ? T
  : never;

export type Get = <T>(selector: Block<T> | Selector<T>) => T;

export interface SelectorFnParams {
  readonly get: Get;
}

export type SelectorFn<T> = (params: SelectorFnParams) => T;

export interface SelectorConfig<T> {
  readonly name?: string;
  readonly get: SelectorFn<T>;
}

export class Selector<T> {
  readonly name?: string;
  private readonly fn: SelectorFn<T>;

  constructor(config: SelectorConfig<T>) {
    this.name = config.name;
    this.fn = config.get;
  }

  run(params: SelectorFnParams): T {
    return this.fn(params);
  }
}

export type AsyncGet = <K extends StoreKey<any>>(selector: K) => GetResult<K>;

export interface AsyncSelectorFnParams {
  readonly get: AsyncGet;
}

export type AsyncSelectorFn<T> = (params: AsyncSelectorFnParams) => Promise<T>;

export interface AsyncSelectorConfig<T> {
  readonly name?: string;
  readonly get: AsyncSelectorFn<T>;
}

export class AsyncSelector<T> {
  readonly name?: string;
  private readonly fn: AsyncSelectorFn<T>;

  constructor(config: AsyncSelectorConfig<T>) {
    this.name = config.name;
    this.fn = config.get;
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
