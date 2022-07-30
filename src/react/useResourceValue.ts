import { Resource } from "../resource";
import { useResource } from "./useResource";

export const useResourceValue = <T>(resource: Resource<T>): T => {
  const loadable = useResource(resource);
  switch (loadable.state) {
    case "hasError":
      throw loadable.error;
    case "hasValue":
      return loadable.value;
    case "loading":
      if (loadable.prebuilt == null) {
        throw loadable.promise();
      } else {
        return loadable.prebuilt;
      }
  }
};
