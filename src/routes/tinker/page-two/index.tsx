import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { listenToAblyStream } from "..";

export default component$(() => {
    useVisibleTask$(() => {
        listenToAblyStream("getting-started").then(async (stream) => {
            for await (const message of stream) {
                console.log(message);
            }
        })
    })
    return <main>
        Heyo!
    </main>
})