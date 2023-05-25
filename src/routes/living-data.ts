import { useSignal, type QRL, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

export const livingData = (func: QRL) => {
  dataFeeder(func).then((result) => result.next());
  //Oddly, this is enough to give the timing it needs to load up the proper QRL

  const useLivingData = function () {
    const signal = useSignal("wee");

    useVisibleTask$(() => {
      dataFeeder().then(async (stream) => {
        for await (const message of stream) {
          signal.value = message;
        }
      });
    });

    return signal;
  };
  return useLivingData;
};

let targetFunc: QRL | undefined = undefined;
export const dataFeeder = server$(async function* (otherFunc?: QRL) {
  if (!targetFunc) {
    targetFunc = otherFunc;
  } else {
    yield await targetFunc();
    await pause(5000);
    yield await targetFunc();
  }
});


export function pause(ms: number) { 
    return new Promise((resolve) => setTimeout(resolve, ms));
}