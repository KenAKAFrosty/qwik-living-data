import {
  $,
  useSignal,
  useVisibleTask$,
  type QRL,
  type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();
const disconnectRequestsByConnectionId = new Set<number>();

/*

  // type ReturnValue = {
  // signal: Signal<undefined | Awaited<ReturnType<Q>>>;
  // pause: QRL<() => void>;
  // refresh: QRL<() => void>;
  // newArguments: QRL<(...args: Parameters<Q>) => void>
  // }
  //If we do ReturnValue it makes the consumer swallow the types until they break it down. not very ergo for DX
  //So we have to repeat here unfortunately
  type UseLivingData = Parameters<UserFunction> extends []
    ? () => {
        signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
        pause: QRL<() => void>;
        refresh: QRL<() => void>;
        newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
      }
    : (...args: Parameters<UserFunction>) => {
        signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
        pause: QRL<() => void>;
        refresh: QRL<() => void>;
        newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
      };




        type _UseLivingData = (
    options: Parameters<UserFunction> extends []
      ? {
          interval?: number;
          startingValue?: StartingValue;
        }
      : {
          initialArgs: Parameters<UserFunction>;
          interval?: number;
          startingValue?: StartingValue;
        }
  ) => {
    signal: StartingValue extends undefined
      ? Signal<undefined | Awaited<ReturnType<UserFunction>>>
      : Signal<Awaited<ReturnType<UserFunction>>>;
    pause: QRL<() => void>;
    refresh: QRL<() => void>;
    newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
  };
*/

export type HasMandatoryParameters<T extends (...args: any[]) => any> =
  // distribute over union types
  Parameters<T> extends [infer P, ...infer Rest]
    ? // check if the first parameter includes `undefined`
      P extends undefined
      ? // if it does, continue checking the rest
        HasMandatoryParameters<(...args: Rest) => any>
      : // if it doesn't, the function has mandatory parameters
        true
    : // if there are no parameters, the function doesn't have mandatory parameters
      false;

export const livingData = <UserFunction extends QRL>(
  func: UserFunction
): Parameters<UserFunction> extends [] //No arguments in provided function
  ? {
      (): {
        signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
        pause: QRL<() => void>;
        refresh: QRL<() => void>;
        newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
      };
      (options: {
        startingValue: Awaited<ReturnType<UserFunction>>;
        interval?: number;
      }): {
        signal: Signal<Awaited<ReturnType<UserFunction>>>;
        pause: QRL<() => void>;
        refresh: QRL<() => void>;
        newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
      };
      (options: {
        interval?: number;
        startingValue?: Awaited<ReturnType<UserFunction>>;
      }): {
        signal: Signal<undefined | Awaited<ReturnType<UserFunction>>>;
        pause: QRL<() => void>;
        refresh: QRL<() => void>;
        newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
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
    } => {
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

    type ConnectAndListen = Parameters<UserFunction> extends []
      ? () => Promise<void>
      : (...args: Parameters<UserFunction>) => Promise<void>;

    const connectAndListen: ConnectAndListen = $(async () => {
      const thisConnectionId = Math.random();
      currentConnection.value = thisConnectionId;
      await disconnectConnectionInstances(connections.value);
      connections.value = [...connections.value, thisConnectionId];
      console.log(connections.value);
      const stream = await dataFeeder({
        qrlId,
        connectionId: thisConnectionId,
        args: currentArgs.value,
      });

      while (true) {
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
      //You'll see the following stayConnected function get repeated.
      //It's just a way to be able to call itself in the failure case.
      //A wrapper for staying connected but without really providing any major new logic.
      //If we try to declare it once out side this and pass it in,
      //We need to wrap it in $(), which in this case causes a whole host of other issues.
      //Simpler to just repeat it a few times where necessary.
      async function stayConnected() {
        try {
          await connectAndListen();
        } catch (e) {
          console.warn("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(stayConnected, 500);
        }
      }
      stayConnected();
    });

    const newArguments = $(async (...args: Parameters<UserFunction>) => {
      currentArgs.value = args;
      async function stayConnected() {
        try {
          await connectAndListen();
        } catch (e) {
          console.warn("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(stayConnected, 500);
        }
      }
      stayConnected();
    });

    useVisibleTask$(({ cleanup }) => {
      cleanup(() => pause());
      async function stayConnected() {
        try {
          await connectAndListen();
        } catch (e) {
          console.warn("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(stayConnected, 500);
        }
      }
      stayConnected();
    });

    return { signal: dataSignal, pause, refresh, newArguments };
  }

  return useLivingData as any; 
  //we're doing a LOT of heavy lifting with the function overloads and stuff
  //So by the time we're here we need to just cast as any and move on otherwise it's hard to get it aligned
};

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
  const interval = options?.interval || 2500;
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
