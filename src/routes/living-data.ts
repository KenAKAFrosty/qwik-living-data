import { useSignal, type QRL, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

export const livingData = <Q extends QRL>(options: {
  qrl: Q;
  interval?: number;
}) => {
  dataFeeder({
    qrl: options.qrl,
  }).then((result) => result.next());
  //Oddly, this is enough to give the timing it needs to load up the proper QRL
  //Also note this pattern might be a bug workaround and may not be necessary forever

  const useLivingData = function () {
    const signal = useSignal<Awaited<ReturnType<Q>>>();

    useVisibleTask$(() => {
      async function connectAndListen() {
        const stream = await dataFeeder();
        try {
          for await (const message of stream) {
            signal.value = message as Awaited<ReturnType<Q>>;
          }
          setTimeout(connectAndListen, 500);
        } catch (e) {
          console.log("Living data connection lost:", e);
          console.log("Retrying");
          setTimeout(connectAndListen, 500);
        }
      }
      connectAndListen();
    });

    return signal;
  };

  return useLivingData;
};

let targetQRL: QRL | undefined = undefined;
export const dataFeeder = server$(async function* (options?: {
  qrl?: QRL;
  interval?: number;
}) {
  if (!targetQRL) {
    targetQRL = options?.qrl;
  } else {
    let lastInvoked = Date.now();
    yield await targetQRL();

    const interval = options?.interval || 5000;
    while (true) {
      if (Date.now() - lastInvoked >= interval) {
        yield await targetQRL();
        lastInvoked = Date.now();
      }
      await pause(40);
    }
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
