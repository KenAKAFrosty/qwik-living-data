import {
  $,
  useOnWindow,
  useSignal,
  useVisibleTask$,
  type QRL,
  type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();
const minimumIntervalByInvocationId = new Map<string, number>();
const defaultIntervalByInvocationId = new Map<string, number | null>();
const disconnectRequestsByConnectionId = new Set<number>();

export type HasMandatoryParameters<T extends (...args: any[]) => any> =
  Parameters<T> extends [infer P, ...infer Rest]
    ? P extends undefined
      ? HasMandatoryParameters<(...args: Rest) => any>
      : true
    : false;

//NOTE: A lot of the following function overloads use tons of repeated info across the different overloads.
//This is because if you pre-create a type to express that, then the consumer of the function sees that type
//rather than the breakdown of options, which isn't as ergonomic.
//If there's a way to adjust for that, I would gladly avoid this repetition.
type LivingDataReturn<UserFunction extends QRL> =
  Parameters<UserFunction> extends [] //No arguments in provided function
    ? {
        (): {
          signal: Readonly<
            Signal<undefined | Awaited<ReturnType<UserFunction>>>
          >;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
          startingValue: Awaited<ReturnType<UserFunction>>;
          interval?: number | null;
        }): {
          signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
          interval?: number | null;
          startingValue?: Awaited<ReturnType<UserFunction>>;
        }): {
          signal: Readonly<
            Signal<undefined | Awaited<ReturnType<UserFunction>>>
          >;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
      }
    : HasMandatoryParameters<UserFunction> extends false //Has arguments but none are mandatory
    ? {
        (): {
          signal: Readonly<
            Signal<undefined | Awaited<ReturnType<UserFunction>>>
          >;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
          initialArgs?: Parameters<UserFunction>;
          startingValue: Awaited<ReturnType<UserFunction>>;
          interval?: number | null;
        }): {
          signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
          initialArgs?: Parameters<UserFunction>;
          interval?: number | null;
          startingValue?: Awaited<ReturnType<UserFunction>>;
        }): {
          signal: Readonly<
            Signal<undefined | Awaited<ReturnType<UserFunction>>>
          >;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
      }
    : {
        //Has arguments and at least 1 is mandatory
        (options: {
          initialArgs: Parameters<UserFunction>;
          startingValue: Awaited<ReturnType<UserFunction>>;
          interval?: number | null;
        }): {
          signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
          initialArgs: Parameters<UserFunction>;
          interval?: number | null;
          startingValue?: Awaited<ReturnType<UserFunction>>;
        }): {
          signal: Readonly<
            Signal<undefined | Awaited<ReturnType<UserFunction>>>
          >;
          pause: QRL<() => void>;
          refresh: QRL<() => void>;
          newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
          newInterval: QRL<(interval: number | null) => void>;
        };
      };

export function livingData<UserFunction extends QRL>(
  func: UserFunction,
  options?: {
    minimumInterval?: number;
    defaultInterval?: number | null;
  }
): LivingDataReturn<UserFunction> {
  const qrlId = func.getSymbol();
  targetQrlById.set(qrlId, func);

  const invocationId = qrlId + JSON.stringify(options);
  if (options?.minimumInterval) {
    minimumIntervalByInvocationId.set(invocationId, options.minimumInterval);
  }
  if (options?.defaultInterval) {
    defaultIntervalByInvocationId.set(invocationId, options.defaultInterval);
  }

  function useLivingData(options?: {
    initialArgs?: Parameters<UserFunction>;
    interval?: number | null;
    startingValue?: Awaited<ReturnType<UserFunction>>;
  }) {
    const dataSignal = useSignal<undefined | Awaited<ReturnType<UserFunction>>>(
      options?.startingValue
    );

    const args = (options?.initialArgs ?? []) as Parameters<UserFunction>;

    const currentArgs = useSignal<Parameters<UserFunction>>(args);
    const currentInterval = useSignal<number | null | undefined>(options?.interval);
    const currentConnection = useSignal<number>(-1);
    const connections = useSignal<number[]>([]);

    const connectAndListen = $(
      async (options?: { skipInitialCall?: boolean }) => {
        const thisConnectionId = Math.random();
        currentConnection.value = thisConnectionId;
        const disconnectPromise = disconnectConnectionInstances(
          connections.value
        );
        connections.value = [...connections.value, thisConnectionId];
        const stream = await dataFeeder({
          qrlId,
          connectionId: thisConnectionId,
          invocationId: invocationId,
          args: currentArgs.value,
          interval: currentInterval.value,
          skipInitialCall: options?.skipInitialCall,
        });
        await disconnectPromise;
        while (currentConnection.value === thisConnectionId) {
          const current = await stream.next();
          if (
            current.done === true ||
            currentConnection.value !== thisConnectionId
          ) {
            break;
          }
          dataSignal.value = current.value as Awaited<ReturnType<UserFunction>>;
        }
        connections.value = connections.value.filter(
          (id) => id !== thisConnectionId
        );
      }
    );

    const pause = $(async () => {
      await disconnectConnectionInstances(connections.value);
    });

    const refresh = $(async () => {
      retryOnFailure(connectAndListen);
    });

    const newArguments = $(async (...args: Parameters<UserFunction>) => {
      currentArgs.value = args;
      retryOnFailure(connectAndListen);
    });

    const newInterval = $(async (interval?: number | null) => {
      currentInterval.value = interval;
      retryOnFailure(() =>
        connectAndListen({ skipInitialCall: true })
      );
    });

    useOnWindow(
      "focus",
      $(() => retryOnFailure(connectAndListen))
    );
    useOnWindow(
      "online",
      $(() => retryOnFailure(connectAndListen))
    );
    useVisibleTask$(({ cleanup }) => {
      cleanup(() => pause());
      retryOnFailure(connectAndListen);
    });

    return { signal: dataSignal, pause, refresh, newArguments, newInterval };
  }

  return useLivingData as LivingDataReturn<UserFunction>;
}

export const disconnectConnectionInstances = server$(
  (connectionIds: number[]) => {
    connectionIds.forEach((connectionId) => {
      disconnectRequestsByConnectionId.add(connectionId);
    });
  }
);

export const dataFeeder = server$(async function* (options: {
  qrlId: string;
  args: any[];
  connectionId: number;
  invocationId: string;
  interval?: number | null;
  skipInitialCall?: boolean;
}) {
  const func = targetQrlById.get(options.qrlId)!;
  if (options.skipInitialCall !== true) {
    yield await func(...options.args);
  }

  let lastCompleted = Date.now();

  const retrievedDefaultInterval = defaultIntervalByInvocationId.get(
    options.invocationId
  );

  const providedInterval = options.interval || retrievedDefaultInterval;
  if (providedInterval === null) {
    return;
  }

  const DEFAULT_INTERVAL = 10000;
  const DEFAULT_MINIMUM_INTERVAL = 80;
  const minimumInterval = minimumIntervalByInvocationId.get(
    options.invocationId
  );

  const interval = Math.max(
    providedInterval || DEFAULT_INTERVAL,
    minimumInterval && minimumInterval > 0
      ? minimumInterval
      : DEFAULT_MINIMUM_INTERVAL
  );

  while (disconnectRequestsByConnectionId.has(options.connectionId) === false) {
    if (Date.now() - lastCompleted >= interval) {
      yield await func(...options.args);
      lastCompleted = Date.now();
    }
    await pause(20);
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnFailure<UserFunction extends () => any>(
  func: UserFunction
): Promise<ReturnType<UserFunction>> {
  const BASE_PAUSE_TIME = 100;
  const PAUSE_TIME_DELAY_MODIFIER = 500;
  const MAX_ATTEMPTS = 7;

  let attempts = 0;
  async function retry(func: UserFunction): Promise<ReturnType<UserFunction>> {
    const pauseTime =
      BASE_PAUSE_TIME + attempts * (attempts / 2) * PAUSE_TIME_DELAY_MODIFIER;
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      throw new Error("Max retry attempts reached");
    }
    try {
      return await func();
    } catch (e) {
      console.warn("Living data connection lost:", e);
      await pause(pauseTime);
      console.warn(`Waited ${pauseTime} ms. Retrying...`);
      return await retry(func);
    }
  }

  return await retry(func);
}
