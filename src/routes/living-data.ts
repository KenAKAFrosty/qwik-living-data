import { $, useSignal, useVisibleTask$, type QRL, type Signal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const shouldStopById = new Map<number, boolean>();
const targetQrlById = new Map<number, QRL>();
const argsById = new Map<number, any[]>();

const refreshRequests: any[] = [];
refreshRequests;

export const livingData = <Q extends QRL>(options: {
  qrl: Q;
  interval?: number;
  startingValue?: Awaited<ReturnType<Q>>;
}) => {
  const id = Math.random();
  targetQrlById.set(id, options.qrl);

  dataFeeder({ qrl: options.qrl }).then((result) => result.next());
  //Oddly, this is enough to give the timing it needs to load up the proper QRL
  //Also note this pattern might be a bug workaround and may not be necessary forever

  shouldStopById.set(id, false);

  type UseLivingData = Parameters<Q> extends []
    ? () => {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        stop: QRL<() => Promise<void>>;
      }
    : (...args: Parameters<Q>) => {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        stop: QRL<() => Promise<void>>;
      };

  const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
    argsById.set(id, args);
    const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(
      options.startingValue
    );

    const stopInitial = useSignal(false);
    const stop = $(async () => {
      console.log("stopping");
      stopInitial.value = true;
      await stopDataFeeder(id);
    });
    useVisibleTask$(({ cleanup }) => {
      async function connectAndListen() {
        try {
          const stream = await dataFeeder({ id });
          for await (const message of stream) {
            if (stopInitial.value === true) {
              break;
            }
            signal.value = message as Awaited<ReturnType<Q>>;
          }
          if (stopInitial.value === false) {
            setTimeout(connectAndListen, 500);
          }
        } catch (e) {
          console.log("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(connectAndListen, 500);
        }
        cleanup(() => {
          stopInitial.value = true;
          stopDataFeeder(id);
        });
      }
      connectAndListen();
    });

    return { signal, stop };
  };

  return useLivingData;
};

export const stopDataFeeder = server$(async function (id: number) {
  shouldStopById.set(id, true);
  return true;
});


export const dataFeeder = server$(async function* (
  options:
    | { qrl: QRL; id?: undefined; interval?: undefined }
    | { qrl?: undefined; id: number; interval?: number }
) {
  if (options.qrl) {
    // targetQRL = options.qrl;
    return;
  }
  const func = targetQrlById.get(options.id)!;


  shouldStopById.set(options.id, false);

  let lastInvoked = Date.now();
  yield await func(...(argsById.get(options.id) || []));

  const interval = options?.interval || 2000;
  while (shouldStopById.get(options.id) === false) {
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
