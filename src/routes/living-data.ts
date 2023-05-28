import {
  $,
  useSignal,
  useVisibleTask$,
  type QRL,
  type Signal,
} from "@builder.io/qwik";
import { server$, type z } from "@builder.io/qwik-city";
import { ZodSchema } from "zod";

const targetQrlById = new Map<string, QRL>();
const validatorById = new Map<string, Zod.Schema>();
const disconnectRequestsByConnectionId = new Set<number>();

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

type IsFunctionWithAtLeastOneArg<T> = T extends (...args: infer U) => any
  ? U extends []
    ? false
    : true
  : false;

export function livingData<
  DesiredArg extends Zod.Schema,
  UserFunction extends QRL<(argument: z.infer<DesiredArg>) => any>
>(
  desiredArgs: DesiredArg,
  func: IsFunctionWithAtLeastOneArg<UserFunction> extends true
    ? UserFunction
    : "Function must have at least one argument"
): LivingDataReturn<UserFunction>;

export function livingData<UserFunction extends QRL>(
  func: UserFunction
): LivingDataReturn<UserFunction>;

//Implementation
export function livingData<
  UserFunction extends QRL,
  Arg1 extends Zod.Schema | UserFunction
>(arg1: Arg1, arg2?: Arg1 extends Zod.Schema ? UserFunction : undefined) {
  const validator = arg1 instanceof ZodSchema ? arg1 : null;
  const func = (arg1 instanceof ZodSchema ? arg2 : arg1) as UserFunction;
  const qrlId = func.getSymbol() + (JSON.stringify(validator?._def) || "");
  if (validator) {
    validatorById.set(qrlId, validator);
  }
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
      await disconnectConnectionInstances(connections.value);
      connections.value = [...connections.value, thisConnectionId];
      const stream = await dataFeeder({
        qrlId,
        connectionId: thisConnectionId,
        args: currentArgs.value,
      });

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

  return useLivingData;
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
  const validator = validatorById.get(options.qrlId);
  let args = options.args;
  if (validator) {
    //Remember: for now, if a validator is used, there's only one argument.
    const validatedArg = validator.parse(options.args[0]);
    //But since we're accommodating the non-validated case, we expect to spread in the args to the function call.
    //That's why we're wrapping the validated arg in an array.
    args = [validatedArg];
  }

  yield await func(...args);
  let lastCompleted = Date.now();

  const interval = Math.max(options?.interval || 2500, 100);
  //Find a more suitable magic number. maybe 20ms? Using 100 for now
  //just avoid crashing a server if someone wanted to be malicious

  while (disconnectRequestsByConnectionId.has(options.connectionId) === false) {
    if (Date.now() - lastCompleted >= interval) {
      yield await func(...args);
      lastCompleted = Date.now();
    }
    await pause(40);
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
