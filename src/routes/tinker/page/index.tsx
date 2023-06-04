import {
  component$,
  useSignal,
  useVisibleTask$,
  noSerialize,
  type NoSerialize,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

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
      <button onClick$={()=> { 
        test().then(console.log)
      }}>
        serv
      </button>
    </main>
  );
});


const test = server$(async function() {
    let socky: any;
    if (typeof WebSocket === "undefined") {
        const WS = await import("ws");
        socky = new WS.WebSocket("wss://ws.postman-echo.com/raw");
    } else { 
        socky = new WebSocket("wss://ws.postman-echo.com/raw");
    }
    console.log(socky);
    const messagePromise = new Promise<string>((resolve) => {
        const listener = (event: any) => {
          socky.removeEventListener("message", listener);
          resolve(event.data.toString());
        };
        socky.addEventListener("message", listener);
      });
      socky.addEventListener("open", function () {
        setTimeout(()=> { 
            socky.send("Hello Server!");
        }, 1000)
      });
    return messagePromise
});