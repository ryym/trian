import { block } from "../block";
import { createContextKey } from "../context";
import { createStore } from "../store";

describe("Context and Store", () => {
  describe("use with block", () => {
    const appVersionContextKey = createContextKey<string>({ name: "app-version" });

    const someSeedValue = block({
      default: (ctx) => {
        const version = ctx.get(appVersionContextKey);
        if (version === undefined || version < "2.0.0") {
          return 100;
        }
        return 200;
      },
    });

    it("returns undefined when context value does not exist", () => {
      const store = createStore();
      const value = store.getValue(someSeedValue);
      expect(value).toEqual(100);
    });

    it("returns value when context value exists", () => {
      const store = createStore();
      store.context.set(appVersionContextKey, "2.1.0");
      const value = store.getValue(someSeedValue);
      expect(value).toEqual(200);
    });

    it("throws error when mustGet used for non-existing context", () => {
      const someValue = block({
        default: (ctx) => {
          return ctx.mustGet(appVersionContextKey).toUpperCase();
        },
      });
      const store = createStore();
      expect(() => {
        store.getValue(someValue);
      }).toThrow(/key not found: app-version/);
    });
  });
});
