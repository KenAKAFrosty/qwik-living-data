
import { type RequestHandler } from "@builder.io/qwik-city";
//https://github.com/ably/ably-js#using-the-realtime-api
export const onGet: RequestHandler = async (event) => {
    const key = event.env.get("ABLY_KEY");

    if (!key) {
        throw new Error("ABLY_KEY not set");
    }
    // const client = new Ably.Realtime.Promise(key);
    // client.connection.on("connected", () => { 
    //     console.log("connected");
    // });
    // client.connection.on("closed", () => {
    //     console.log("disconnected");
    // });
    // client.connection.on("failed", () => {
    //     console.log("failed");
    // });

    const response = await fetch("https://realtime.ably.io/channels/getting-started/messages", {
        method: "GET",
        headers: {
            "Authorization": `Basic ${btoa(key)}`,
            "Content-Type": "application/json"
        },
        // body: JSON.stringify({
        //     name: "Test",
        //     data: "hello there"
        // })
    }).then((res) => res.json());
    // client.connection.close();
    console.log(response);
    event.json(200, response);
}
