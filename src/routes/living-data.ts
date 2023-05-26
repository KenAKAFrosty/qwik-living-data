import {
  $,
  useSignal,
  useVisibleTask$,
  type QRL,
  type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const shouldStopById = new Map<number, boolean>();
const targetQrlById = new Map<number, QRL>();
const argsById = new Map<number, any[]>();
const refreshRequestById = new Set<number>();

export const livingData = <Q extends QRL>(options: {
  qrl: Q;
  interval?: number;
  startingValue?: Awaited<ReturnType<Q>>;
}) => {
  const id = Math.random();
  targetQrlById.set(id, options.qrl);

  dataFeeder().then((result) => result.next());
  //Oddly, this is enough to give the timing it needs to load up the proper QRL
  //Also note this pattern might be a bug workaround and may not be necessary forever

  shouldStopById.set(id, false);

  type UseLivingData = Parameters<Q> extends []
    ? () => {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        stop: ReturnType<typeof server$>;
        refresh: ReturnType<typeof server$>;
      }
    : (...args: Parameters<Q>) => {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        stop: ReturnType<typeof server$>;
        refresh: ReturnType<typeof server$>;
      };

  const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
    argsById.set(id, args);
    const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(
      options.startingValue
    );

    const stopListening = useSignal(false);

    const stop = $(async () => {
      console.log("stopping");
      stopListening.value = true;
      await stopDataFeeder(id);
    });

    const refresh = $(async () => {
      await refreshDataFeeder(id);
    });

    useVisibleTask$(({ cleanup }) => {
      async function connectAndListen() {
        try {
          const stream = await dataFeeder({ id });
          for await (const message of stream) {
            if (stopListening.value === true) {
              break;
            }
            signal.value = message as Awaited<ReturnType<Q>>;
          }
          if (stopListening.value === false) {
            setTimeout(connectAndListen, 500);
          }
        } catch (e) {
          console.warn("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(connectAndListen, 500);
        }
        cleanup(() => {
          stopListening.value = true;
          stopDataFeeder(id);
        });
      }
      connectAndListen();
    });

    return { signal, stop, refresh };
  };

  return useLivingData;
};

export const stopDataFeeder = server$(async function (id: number) {
  shouldStopById.set(id, true);
  return true;
});

export const refreshDataFeeder = server$(async function (id: number) {
  refreshRequestById.add(id);
  return true;
});

export const dataFeeder = server$(async function* (options?: {
  id: number;
  interval?: number;
}) {
  if (!options) {
    return; //this is part of that weird qurik to get the proper QRL 'loaded in'
  }

  const func = targetQrlById.get(options.id)!;
  shouldStopById.set(options.id, false);

  let lastInvoked = Date.now();
  yield await func(...(argsById.get(options.id) || []));

  const interval = options?.interval || 5000;
  while (shouldStopById.get(options.id) === false) {
    if (refreshRequestById.has(options.id)) {
      console.log("firing");
      yield await func(...(argsById.get(options.id) || []));
      refreshRequestById.delete(options.id);
      lastInvoked = Date.now();
    }

    if (Date.now() - lastInvoked >= interval) {
      console.log("firing");
      yield await func(...(argsById.get(options.id) || []));
      lastInvoked = Date.now();
    }

    await pause(40);
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
