import { $, component$, useSignal, useStylesScoped$, useTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { sql, type Selectable } from "kysely";
import { getDb } from "~/database/planetscale";
import type { DB } from "~/database/planetscale-types";
import { livingData } from "~/living-data/living-data";
import { useDbSetupAndGetUsername } from "~/routes/layout";
import { SimpleUserIcon } from "../icons";
import styles from "./chat.css?inline"



export const getRecentChatMessages = server$(async function() {
    return getDb()
            .selectFrom("chat_messages")
            .innerJoin("users", "chat_messages.ip", "users.ip")
            .select(["chat_messages.message_text", "chat_messages.timestamp", "users.nickname"])
            .orderBy("timestamp", "desc")
            .limit(20)
            .execute();
})

export const useChatMessages = livingData(getRecentChatMessages);

export const Chat = component$((props: { 
    startingMessages: Array<
        Omit<Selectable<DB["chat_messages"]>, "id" | "ip">
        & Pick<Selectable<DB["users"]>, "nickname">
    >
}) => {

  useStylesScoped$(styles);
  const chatMessages = useChatMessages({ 
      startingValue: props.startingMessages,
  })
  const username = useDbSetupAndGetUsername();
  const currentMessage = useSignal("");
  const error = useSignal("");
  const errorRemovalTimeout = useSignal(-1)
  useTask$(({track})=> { 
    track(()=> error.value);
    clearTimeout(errorRemovalTimeout.value);
    if (error.value) { 
        errorRemovalTimeout.value = setTimeout(()=> { 
            error.value = "";
        }, 5000) as unknown as number
    }
  });



  const submitMessage = $(()=> { 
    if (currentMessage.value) { 
      const message = currentMessage.value.endsWith("\n") ? currentMessage.value.slice(0, -1) : currentMessage.value;
      sendChatMessage(message).then(result => { 
        if (result !== "Success") { 
            currentMessage.value = message; //don't want to swallow the message, give a chance to retry.
            error.value = result;
        }
      });
      currentMessage.value = "";
    }
  });

  const messagesRef = useSignal<Element>();
  return (
    <section>
      <h2>Have a Chat</h2>
      <div class="chatbox">

        <div class="entry">
          <SimpleUserIcon /><span>{username}</span><hr /> 
          <textarea 
            placeholder="Say hi..." 
            value={currentMessage.value} 
            onInput$={(event) => { 
                const target = event.target as HTMLTextAreaElement;
                currentMessage.value = target.value;
            }} 
            onKeyDown$={(event)=> { 
                if (event.key === "Enter" && !event.shiftKey) { 
                    submitMessage();
                }
            }}
          />
        </div>
        <div class={{ 
            error: true,
            invisible: error.value === ""
        }}>
            {error.value}
        </div>
        <div class="messages" ref={messagesRef}>
            {chatMessages.signal.value.map(message => {
                return <div 
                    key={message.nickname + message.message_text + message.timestamp?.getTime()}
                    class="message"
                    style={{color: stringToDarkColor(message.nickname)}}
                >
                    <div class="context">
                        <span class="user-icon"><SimpleUserIcon height={34} width={34} /></span>
                        <div class="name-and-time">
                            <span class="name">{message.nickname}</span>
                            <span class="time">{message.timestamp?.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="text-holder"><span class="message-text">{message.message_text}</span></div>
                </div>
            })}
        </div>

      </div>
    </section>
  );
});


export const sendChatMessage = server$(async function(message: string) {
    if (message.length > 300) { 
        return "Message too long; max 300 characters." as const;
    }
    const db = getDb();
    const headers = this.request.headers;
    const ip = this.url.hostname === "localhost" ? "dev" : headers.get("x-forwarded-for") || headers.get("x-real-ip") || headers.get("x-vercel-proxied-for");
    if (!ip) {return "Unexpected error. Please try again later." as const}

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const recentMessagesFromThisIp = await db
                                    .selectFrom("chat_messages")
                                    .select(sql<number>`COUNT(*)`.as("count"))
                                    .where("ip", "=", ip)
                                    .where("timestamp", ">", oneMinuteAgo)
                                    .executeTakeFirstOrThrow();

   const MAX_ALLOWED_MESSAGES_PER_MINUTE = 10;
    if (recentMessagesFromThisIp.count > MAX_ALLOWED_MESSAGES_PER_MINUTE) {
        return "Too many messages in a short period." as const;
    }

    await db.insertInto("chat_messages").values({message_text: message, ip}).execute();
    return "Success" as const;
});


function stringToDarkColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '';
    for (let i = 0; i < 3; i++) {
        let value = Math.abs((hash >> (i * 8)) & 0xFF);
        value = Math.floor(value / 2); // This ensures the color is always somewhat dark
        color += ('00' + value.toString(16)).slice(-2);
    }

    return '#' + color;
}
