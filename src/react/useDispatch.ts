import { useTrianContext } from "./TrianContext";
import { Dispatch } from "../dispatch";

export const useDispatch = <Ctx = any>(): Dispatch<Ctx> => {
  const { dispatch } = useTrianContext<Ctx>();
  return dispatch;
};
