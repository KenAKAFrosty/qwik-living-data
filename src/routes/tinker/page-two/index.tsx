import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { listenToAblyStream } from "..";
import { livingData } from "~/living-data/living-data";
import { server$ } from "@builder.io/qwik-city";

// const useLivingAbly = livingData(listenToAblyStream);
const useTest = livingData(server$(async function () {
    return "hi!"
}))

export default component$(() => {
    // const ably = useLivingAbly({
    //     initialArgs: ["getting-started"],
    //     interval: null
    // });
    const test = useTest({
        interval: null
    });
    console.log(test.signal.value);
    useVisibleTask$(() => {
        // listenToAblyStream("getting-started").then(async (stream) => {
        //     for await (const message of stream) {
        //         console.log(message);
        //     }
        // })
    })
    return <main>
        Heyo!
    </main>
})