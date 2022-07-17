import { Block, Comparer } from "./block";
import { Context } from "./context";
import { Selector } from "./selector";

export type AnyGet = <K extends AnyGetKey<any>>(key: K) => AnyGetResult<K>;

export type AnyGetKey<T> = Block<T> | Selector<T> | Loader<T>;

export type AnyGetResult<K extends AnyGetKey<any>> = K extends Loader<infer T>
  ? Promise<T>
  : K extends AnyGetKey<infer T>
  ? T
  : never;

export interface LoaderConfig<T> {
  readonly name?: string;
  readonly get: LoaderFn<T>;
  readonly isSame?: Comparer<T>;
  readonly onCacheInvalidate?: (event: LoaderCacheInvalidateEvent<T>) => void;
  readonly onDelete?: (event: LoaderDeletionEvent<T>) => void;
}

export interface LoaderCacheInvalidateEvent<T> {
  readonly last: null | { value: T };
}

export interface LoaderDeletionEvent<T> {
  readonly last: null | { value: T };
}

export type LoaderFn<T> = (params: LoaderFnParams, ctx: Context) => Promise<T>;

export interface LoaderFnParams {
  readonly get: AnyGet;
  set<T>(block: Block<T>, next: T | ((cur: T) => T)): void;
}

export class Loader<T> {
  readonly name?: string;
  private readonly get: LoaderFn<T>;
  readonly isSame: Comparer<T>;
  readonly onCacheInvalidate?: (event: LoaderCacheInvalidateEvent<T>) => void;
  readonly onDelete?: (event: LoaderDeletionEvent<T>) => void;

  constructor(config: LoaderConfig<T>) {
    this.name = config.name;
    this.get = config.get;
    this.isSame = config.isSame || Object.is;
    this.onCacheInvalidate = config.onCacheInvalidate;
    this.onDelete = config.onDelete;
  }

  run(params: LoaderFnParams, ctx: Context): Promise<T> {
    return this.get(params, ctx);
  }
}

export const loader = <T>(config: LoaderConfig<T>): Loader<T> => {
  return new Loader(config);
};
