import { Block } from "./block";
import { Context } from "./context";
import { Selector } from "./selector";

export interface ResourceConfig<T> {
  readonly name?: string;
  readonly fetch: (p: ResourceFetchParams, ctx: Context) => Promise<T>;
  readonly prebuild?: (p: ResourcePrebuildParams, ctx: Context) => PrebuiltResult<T> | undefined;
  readonly setResult?: (value: T, p: ResourceSetResultParams, ctx: Context) => void;
}

export interface PrebuiltResult<T> {
  readonly value: T;
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

export class Resource<T> {
  constructor(private readonly config: ResourceConfig<T>) {}

  fetch = this.config.fetch;

  prebuild(p: ResourcePrebuildParams, ctx: Context): PrebuiltResult<T> | undefined {
    return this.config.prebuild?.(p, ctx);
  }

  setResult(value: T, p: ResourceSetResultParams, ctx: Context): void {
    this.config.setResult?.(value, p, ctx);
  }
}

export interface ResourceFetchActionParams<T> {
  prebuild?: (currentValue: T) => T;
}

export const resource = <T>(config: ResourceConfig<T>): Resource<T> => {
  return new Resource(config);
};
