import { Block } from "./block";
import { Context } from "./context";
import { Selector } from "./selector";

export interface ResourceConfig<V> {
  readonly name?: string;
  readonly fetch: (p: ResourceFetchParams, ctx: Context) => Promise<V>;
  readonly prebuild?: (p: ResourcePrebuildParams, ctx: Context) => V | undefined;
  readonly setResult?: (value: V, p: ResourceSetResultParams, ctx: Context) => void;
}

type Get = <T>(gettable: Block<T> | Selector<T>) => T;
type Fetch = <T>(fetchable: Resource<T>) => Promise<T>;
type Set = <T>(block: Block<T>, next: T | ((cur: T) => T)) => void;

export interface ResourceFetchParams {
  readonly get: Get;
  readonly fetch: Fetch;
}

export interface ResourcePrebuildParams {
  readonly get: Get;
}

export interface ResourceSetResultParams {
  readonly get: Get;
  readonly set: Set;
}

export class Resource<V> {
  constructor(private readonly config: ResourceConfig<V>) {}

  fetch = this.config.fetch;

  prebuild(p: ResourcePrebuildParams, ctx: Context): V | undefined {
    return this.config.prebuild?.(p, ctx);
  }

  setResult(value: V, p: ResourceSetResultParams, ctx: Context): void {
    this.config.setResult?.(value, p, ctx);
  }
}

export interface ResourceFetchActionParams<V> {
  prebuild?: (currentValue: V) => V;
}

export const resource = <V>(config: ResourceConfig<V>): Resource<V> => {
  return new Resource(config);
};
