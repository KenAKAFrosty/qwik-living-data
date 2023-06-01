import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { SimpleUserIcon } from "../icons";

export const Chat = component$(() => {
  useStylesScoped$(`
        section { 
            background: var(--qwik-light-purple);
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            gap: 16px;
        }

        .chatbox { 
            height: 400px;
            overflow-y: scroll;
            background: white;
            width: 90%;
            max-width: 50rem;
            border-radius: 8px;
            -ms-overflow-style: none; 
            scrollbar-width: none; 
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .chatbox::-webkit-scrollbar {
            display: none;
        }
        .messages { 
            flex-grow: 1;
        }
        .entry { 
            width: 100%;
            background: var(--qwik-dark-purple);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 50px;
            gap: 5px;
            padding-left: 10px;
        }
        textarea { 
            font-size: 20px;
            font-family: inherit;
            height: 30px;
            width: 90%;
            resize: none;
            color:white;
            background: var(--qwik-dark-purple);
            border: none;
        }
        textarea:focus { 
            outline: none;
        }
        textarea::placeholder {
            color: var(--qwik-light-purple);
        }
    `);
  return (
    <section>
      <h2>Have a Chat</h2>
      <div class="chatbox">
        <div class="messages"></div>
        <div class="entry">
         <SimpleUserIcon /> <textarea placeholder="Say hi..." />
        </div>
      </div>
    </section>
  );
});
