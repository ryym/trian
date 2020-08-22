export interface FamilyConfig<V, Args extends any[]> {
  readonly key: (...args: Args) => any;
  readonly value: (...args: Args) => V;
}

export class Family<V, Args extends any[]> {
  private keyToMember: Map<any, V> = new Map();

  readonly key: (...args: Args) => any;
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

  keys = (): any[] => {
    return [...this.keyToMember.keys()];
  };

  remove = (...args: Args): boolean => {
    const key = this.key(...args);
    return this.keyToMember.delete(key);
  };
}
