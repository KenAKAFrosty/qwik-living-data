import {
  $,
  useSignal,
  useVisibleTask$,
  type QRL,
  type Signal,
  useOnWindow,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();
const disconnectRequestsByConnectionId = new Set<number>();

export type HasMandatoryParameters<T extends (...args: any[]) => any> =
  Parameters<T> extends [infer P, ...infer Rest]
  ?
  P extends undefined
  ?
  HasMandatoryParameters<(...args: Rest) => any>
  :
  true
  :
  false;

type LivingDataReturn<UserFunction extends QRL> =
  Parameters<UserFunction> extends [] //No arguments in provided function
  ? {
    (): {
      signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
    };
    (options: {
      startingValue: Awaited<ReturnType<UserFunction>>;
      interval?: number;
    }): {
      signal: Signal<Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
    };
    (options: {
      interval?: number;
      startingValue?: Awaited<ReturnType<UserFunction>>;
    }): {
      signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
    };
  }
  : HasMandatoryParameters<UserFunction> extends false //Has arguments but none are mandatory
  ? {
    (): {
      signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
      newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
    };
    (options: {
      initialArgs?: Parameters<UserFunction>;
      startingValue: Awaited<ReturnType<UserFunction>>;
      interval?: number;
    }): {
      signal: Signal<Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
      newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
    };
    (options: {
      initialArgs?: Parameters<UserFunction>;
      interval?: number;
      startingValue?: Awaited<ReturnType<UserFunction>>;
    }): {
      signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
      newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
    };
  }
  : {
    //Has arguments and at least 1 is mandatory
    (options: {
      initialArgs: Parameters<UserFunction>;
      startingValue: Awaited<ReturnType<UserFunction>>;
      interval?: number;
    }): {
      signal: Signal<Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
      newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
    };
    (options: {
      initialArgs: Parameters<UserFunction>;
      interval?: number;
      startingValue?: Awaited<ReturnType<UserFunction>>;
    }): {
      signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
      pause: QRL<() => void>;
      refresh: QRL<() => void>;
      newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
    };
  };


export function livingData<
  UserFunction extends QRL,
>(func: UserFunction): LivingDataReturn<UserFunction> {
  const qrlId = func.getSymbol();
  targetQrlById.set(qrlId, func);

  function useLivingData(options?: {
    initialArgs?: Parameters<UserFunction>;
    interval?: number;
    startingValue?: Awaited<ReturnType<UserFunction>>;
  }) {
    const dataSignal = useSignal<undefined | Awaited<ReturnType<UserFunction>>>(
      options?.startingValue
    );
    const args = (options?.initialArgs ?? []) as Parameters<UserFunction>;

    const currentArgs = useSignal<Parameters<UserFunction>>(args);
    const currentConnection = useSignal<number>(-1);
    const connections = useSignal<number[]>([]);

    const connectAndListen = $(async () => {
      const thisConnectionId = Math.random();
      currentConnection.value = thisConnectionId;
      const disconnectPromise = disconnectConnectionInstances(connections.value);
      connections.value = [...connections.value, thisConnectionId];
      const stream = await dataFeeder({
        qrlId,
        connectionId: thisConnectionId,
        args: currentArgs.value,
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
    });

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

    useOnWindow('focus', $(() => retryOnFailure(connectAndListen)));
    useOnWindow('online', $(() => retryOnFailure(connectAndListen)));
    useVisibleTask$(({ cleanup }) => {
      cleanup(() => pause());
      retryOnFailure(connectAndListen);
    });

    return { signal: dataSignal, pause, refresh, newArguments };
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
  interval?: number;
}) {
  const func = targetQrlById.get(options.qrlId)!;

  yield await func(...options.args);
  let lastCompleted = Date.now();

  const DEFAULT_INTERVAL = 10000;
  const interval = Math.max(options?.interval || DEFAULT_INTERVAL, 50);
  //Find a more suitable magic number. maybe 20ms? Using 50 for now
  //just avoid crashing a server if someone wanted to be malicious
  //Also, allow this to be passed as setup information so user can still adjust

  while (disconnectRequestsByConnectionId.has(options.connectionId) === false) {
    if (Date.now() - lastCompleted >= interval) {
      yield await func(...options.args);
      lastCompleted = Date.now();
    }
    await pause(40);
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function retryOnFailure<UserFunction extends () => any>(func: UserFunction): Promise<ReturnType<UserFunction>> {
  const BASE_PAUSE_TIME = 100;
  const PAUSE_TIME_DELAY_MODIFIER = 500;
  const MAX_ATTEMPTS = 7;

  let attempts = 0;
  async function retry(func: UserFunction): Promise<ReturnType<UserFunction>> {
    const pauseTime = BASE_PAUSE_TIME + ((attempts * (attempts / 2)) * PAUSE_TIME_DELAY_MODIFIER)
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      throw new Error("Max retry attempts reached");
    }
    try {
      return await func();
    } catch (e) {
      console.warn("Living data connection lost:", e);
      await pause(pauseTime);
      console.warn(`Waited ${pauseTime} ms. Retrying...`)
      return await retry(func);
    }
  }

  return await retry(func);
}