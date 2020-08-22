// Implementation reference: https://github.com/moroshko/shallow-equal

export type AnyObject = {
  [key: string]: any;
  [key: number]: any;
};

export const shallowEqualObjects = (a: AnyObject, b: AnyObject): boolean => {
  if (a === b) {
    return true;
  }

  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }

  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (a[key] !== b[key] || !Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
  }
  return true;
};

export const shallowEqualArrays = (a: unknown[], b: unknown[]): boolean => {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
