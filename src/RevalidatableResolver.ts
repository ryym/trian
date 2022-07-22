export interface RevalidatableResolverConfig<T> {
  readonly get: () => Promise<T>;
  readonly revalidate: () => Promise<T>;
}

interface RevalidationRequestWaiter {
  readonly promise: Promise<void>;
  readonly sendRequest: () => void;
  readonly close: () => void;
}

type ResolvedResult<T> =
  | {
      readonly type: "resolved";
      readonly value: T;
    }
  | {
      readonly type: "revalidationRequested";
    };

export class RevalidatableResolver<T> {
  private readonly config: RevalidatableResolverConfig<T>;
  private revalidationRequest: RevalidationRequestWaiter;
  private promise: Promise<T> | null = null;

  constructor(config: RevalidatableResolverConfig<T>) {
    this.config = config;
    this.revalidationRequest = this.makeRevalidationRequestWaiter();
  }

  requestToRevalidate = (): void => {
    this.revalidationRequest.sendRequest();
  };

  resolveWithAutoRevalidation = (): Promise<T> => {
    if (this.promise == null) {
      this.promise = this.makeRevalidatablePromise();
    }
    return this.promise;
  };

  private makeRevalidatablePromise = async (): Promise<T> => {
    let valuePromise = this.config.get();
    for (let i = 0; i < 100; i++) {
      const result = await this.resolveOrCancel(valuePromise, this.revalidationRequest);
      switch (result.type) {
        case "resolved":
          return result.value;
        case "revalidationRequested":
          valuePromise = this.config.revalidate();
          this.revalidationRequest = this.makeRevalidationRequestWaiter();
      }
    }
    throw new Error("[RevalidatableResolver] too many revalidation");
  };

  private makeRevalidationRequestWaiter(): RevalidationRequestWaiter {
    const controller = new AbortController();
    const promise = new Promise<void>((resolve, reject) => {
      controller.signal.addEventListener("abort", () => {
        if (controller.signal.reason === "revalidate") {
          resolve();
        } else {
          reject();
        }
      });
    });
    return {
      promise,
      sendRequest: () => controller.abort("revalidate"),
      close: () => controller.abort("close"),
    };
  }

  private resolveOrCancel(
    valuePromise: Promise<T>,
    rrw: RevalidationRequestWaiter,
  ): Promise<ResolvedResult<T>> {
    return Promise.race([
      valuePromise.then((value) => {
        return { type: "resolved", value } as ResolvedResult<T>;
      }),
      rrw.promise
        .catch(() => {})
        .then(() => {
          return { type: "revalidationRequested" } as ResolvedResult<T>;
        }),
    ]).then((value) => {
      rrw.close();
      return value;
    });
  }
}
