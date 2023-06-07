import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { listenToAblyStream, sendAblyMessage } from "..";
import { livingData } from "~/living-data/living-data";


const useLivingAbly = livingData(listenToAblyStream);


export default component$(() => {
    const ably = useLivingAbly({
        initialArgs: ["getting-started"]
    });
    ably.signal.value;
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
        <button onClick$={async () => { 
            await sendAblyMessage("Hey there!")
        }}>
            hmmm
        </button>
    </main>
})