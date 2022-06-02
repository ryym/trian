export interface FamilyConfig<V, Args extends unknown[]> {
  readonly key: (...args: Args) => unknown;
  readonly value: (...args: Args) => V;
}

export class Family<V, Args extends unknown[]> {
  private keyToMember: Map<unknown, V> = new Map();

  readonly key: (...args: Args) => unknown;
  private readonly value: (...args: Args) => V;

  constructor({ key, value }: FamilyConfig<V, Args>) {
    this.key = key;
    this.value = value;
  }

  by = (...args: Args): V => {
    const key = this.key(...args);
    let member = this.keyToMember.get(key);
    if (member == null) {
      member = this.value(...args);
      this.keyToMember.set(key, member);
    }
    return member;
  };

  keys = (): unknown[] => {
    return [...this.keyToMember.keys()];
  };

  delete = (...args: Args): boolean => {
    const key = this.key(...args);
    return this.keyToMember.delete(key);
  };
}
