import { useSignal, type QRL, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

export const livingData = <Q extends QRL>(options: {
  func: Q;
  interval?: number;
}) => {
  dataFeeder({
    otherFunc: options.func,
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

let targetFunc: QRL | undefined = undefined;
export const dataFeeder = server$(async function* (options?: {
  otherFunc?: QRL;
  interval?: number;
}) {
  if (!targetFunc) {
    targetFunc = options?.otherFunc;
  } else {
    let lastInvoked = Date.now();
    yield await targetFunc();

    const interval = options?.interval || 5000;
    while (true) {
      if (Date.now() - lastInvoked >= interval) {
        yield await targetFunc();
        lastInvoked = Date.now();
      }
      await pause(40);
    }
  }
});

export function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
