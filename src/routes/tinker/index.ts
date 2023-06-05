
import { server$, type RequestHandler } from "@builder.io/qwik-city";
//https://github.com/ably/ably-js#using-the-realtime-api
export const onGet: RequestHandler = async (event) => {
   event.text(200,"hey")

}

export const listenToAblyStream = server$(
    async function* (channel: string) {
        const key = this.env.get("ABLY_KEY");
        if (!key) {
            throw new Error("Critical access information is missing");
        }
        const url = new URL("https://realtime.ably.io/sse");
        url.searchParams.set("channels", channel);
        url.searchParams.set("v", "1.2");
        url.searchParams.set("heartbeats", "true");
        url.searchParams.set("key", key);

        const response = await fetch(url.toString());

        const stream = response.body?.getReader();
        if (!stream) {
            throw new Error("No stream");
        }
        const decoder = new TextDecoder("utf-8");
        let keepGoing = true;
        let buffer = '';
        while (keepGoing) {
            const { done, value } = await stream.read();
            if (done) {
                keepGoing = false;
                break;
            }
            buffer += decoder.decode(value);
            if (buffer.endsWith("\n")) {
                const lines = buffer.split("\n");
                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        const data = JSON.parse(line.slice(5));
                        yield data as {
                            id: string,
                            timestamp: number,
                            channel: string,
                            name: string,
                            data: string
                        };
                    }
                }
                buffer = '';
            }
        }
    });
