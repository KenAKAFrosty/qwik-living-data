import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { listenToAblyStream } from "..";
import { livingData } from "~/living-data/living-data";


const useLivingAbly = livingData(listenToAblyStream);


export default component$(() => {
    const ably = useLivingAbly({
        initialArgs: ["getting-started"]
    });

    console.log(ably.signal.value);
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