export interface RestartableOperationParams {
  readonly isFirstRun: boolean;
}

export type RestartableOperation<T> = (params: RestartableOperationParams) => Promise<T>;

export type Restart = () => void;

const restartSignal = Symbol("restartSignal");
type RestartSignal = typeof restartSignal;

export const makeRestartablePromise = <T>(run: RestartableOperation<T>): [Restart, Promise<T>] => {
  let controller = new AbortController();

  const restart = () => {
    controller.abort(restartSignal);
  };

  const finalPromise = (async () => {
    let promise = run({ isFirstRun: true });
    for (let i = 0; i < 100; i++) {
      const result = await race(promise, controller);
      if (result === restartSignal) {
        promise = run({ isFirstRun: false });
        controller = new AbortController();
      } else {
        return result;
      }
    }
    throw new Error("[Trian] too many promise restarting");
  })();

  return [restart, finalPromise];
};

const race = async <T>(
  promise: Promise<T>,
  controller: AbortController,
): Promise<T | RestartSignal> => {
  const canceller = new Promise<RestartSignal>((resolve) => {
    controller.signal.addEventListener("abort", () => {
      resolve(controller.signal.reason);
    });
  });
  const result = await Promise.race([promise, canceller]);

  // Prevent canceller from remaining in the pending state.
  controller.abort();

  return result;
};
