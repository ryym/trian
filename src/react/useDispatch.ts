import { useTrianContext } from "./TrianContext";
import { Dispatch } from "../dispatch";

export const useDispatch = (): Dispatch => {
  const { dispatch } = useTrianContext();
  return dispatch;
};
