import { Context } from "./context";

export type Comparer<T> = (a: T, b: T) => boolean;

export interface BlockChangeEvent<T> {
  readonly lastValue: T;
  readonly value: T;
}

export interface BlockDeletionEvent<T> {
  readonly lastValue: T;
}

export interface BlockConfig<T> {
  readonly name?: string;
  readonly default: (ctx: Context) => T;
  readonly isSame?: Comparer<T>;
  readonly onUpdate?: (event: BlockChangeEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;
}

export class Block<T> {
  readonly name?: string;
  readonly default: (ctx: Context) => T;
  readonly isSame: Comparer<T>;
  readonly onUpdate?: (event: BlockChangeEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;

  constructor(config: BlockConfig<T>) {
    this.name = config.name;
    this.default = config.default;
    this.isSame = config.isSame || Object.is;
    this.onUpdate = config.onUpdate;
    this.onDelete = config.onDelete;
  }
}

export const block = <T>(config: BlockConfig<T>): Block<T> => {
  return new Block(config);
};
