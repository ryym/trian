export const createContext = (): Context => {
  return new Context();
};

export class Context {
  private readonly map = new Map<ContextKey<any>, any>();

  get = <T>(key: ContextKey<T>): T | undefined => {
    return this.map.get(key);
  };

  mustGet = <T>(key: ContextKey<T>): T => {
    const value = this.get(key);
    if (value === undefined) {
      const name = key.name || "no-name";
      throw new Error(`[Trian] [Context.mustGet] key not found: ${name}`);
    }
    return value;
  };

  set = <T>(key: ContextKey<T>, value: T): void => {
    this.map.set(key, value);
  };

  delete = (key: ContextKey<unknown>): boolean => {
    return this.map.delete(key);
  };
}

export interface ContextKeyParams {
  readonly name?: string;
}

export const createContextKey = <T>(params?: ContextKeyParams): ContextKey<T> => {
  return new ContextKey<T>(params);
};

export class ContextKey<T> {
  readonly name?: string;
  readonly _phantom?: T;

  constructor(params: ContextKeyParams = {}) {
    this.name = params.name;
  }
}
