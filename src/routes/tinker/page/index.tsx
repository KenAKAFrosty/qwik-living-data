import {
  component$,
  useSignal,
  useVisibleTask$,
  noSerialize,
  type NoSerialize,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { wait } from "~/living-data/living-data";

export default component$(() => {
  const ws = useSignal<NoSerialize<WebSocket>>();
  useVisibleTask$(() => {
    console.log("hi");

    // Create a WebSocket connection to the echo server
    const socket = noSerialize(new WebSocket("wss://ws.postman-echo.com/raw"));
    if (!socket) {
      throw new Error("Socket undefined");
    }
    ws.value = socket;
    // Connection opened
    socket.addEventListener("open", function () {
      socket.send("Hello Server!");
    });

    // Listen for messages
    socket.addEventListener("message", function (event) {
      console.log("Message from server: ", event.data);
    });

    // Connection closed
    socket.addEventListener("close", function (event) {
      console.log("Server connection closed: ", event.reason);
    });

    // Error handling
    socket.addEventListener("error", function (event) {
      console.log("Error: ", event);
    });
  });

  const messageSignal = useSignal("");
  return (
    <main>
      <h1>Page</h1>
      <input bind:value={messageSignal}></input>
      <button
        onClick$={() => {
          console.log(ws.value?.send(messageSignal.value));
        }}
      ></button>
      <button
        onClick$={() => {
          test().then(async (eventStream) => {
            for await (const message of eventStream) {
              console.log(message);
            }
          });
        }}
      >
        serv
      </button>
    </main>
  );
});

const test = server$(async function* () {
  let socky: WebSocket;
  if (typeof WebSocket === "undefined") {
    const WS = await import("ws");
    socky = new WS.WebSocket(
      "wss://ws.postman-echo.com/raw"
    ) as unknown as WebSocket;
  } else {
    socky = new WebSocket("wss://ws.postman-echo.com/raw");
  }

  let keepWaiting = true;
  const messages: string[] = [];
  socky.addEventListener("message", function (event: any) {
    messages.push("Message from socket: " + event.data.toString());
  });
  socky.addEventListener("close", () => {
    keepWaiting = false;
  });
  socky.addEventListener("open", () => {
    socky.send(Math.random().toString());
    setInterval(() => {
      socky.send(Math.random().toString());
    }, 2000);
  });
  while (keepWaiting) {
    while (messages.length > 0) {
      yield messages.shift()!;
    }
    await wait(20);
  }
});
