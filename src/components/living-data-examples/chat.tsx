import { $, component$, useSignal, useStylesScoped$, useTask$, useVisibleTask$ } from "@builder.io/qwik";
import {server$ } from "@builder.io/qwik-city";
import { sql, type Selectable } from "kysely";
import { getDb } from "~/database/planetscale";
import type { DB } from "~/database/planetscale-types";
import { livingData } from "~/living-data/living-data";
import { useUsername } from "~/routes/layout";
import { SimpleMultipleUsersIcon, SimpleUserIcon } from "../icons";
import styles from "./chat.css?inline"
import { getIp } from "~/users/functions";

//NOTE: If this were a proper production app, then it would be advised to use an 
//in-memory database (Redis, memcached, etc.) given how frequently this is polling (only 180ms between calls - and PER visitor!)
//The polling itself happens server side (edge functions in our case here) which is awesome benefit to not make our users' devices have to do that
//but it doesn't change the fact that the data source still has to get hit very very frequently to keep it feeling super snappy and realtime

//In this demo, I just used a SQL database for (1) simplicity, and (2) to also let this serve as a demo for using databases on the edge with Qwik

export const getRecentChatMessages = server$(async function() {
    return getDb(this)
            .selectFrom("chat_messages")
            .innerJoin("users", "chat_messages.ip", "users.ip")
            .select(["chat_messages.message_text", "chat_messages.timestamp", "users.nickname"])
            .orderBy("timestamp", "desc")
            .limit(20)
            .execute();
})


export const getOnlineUsersCount = server$(async function() { 
    const db = getDb(this);
    const now = new Date();
    const threeSecondsAgo = new Date(now.getTime() - 3 * 1000);
    const onlineUsers = await db
                            .selectFrom("users")
                            .select(sql<number>`COUNT(*)`.as("count"))
                            .where("last_active", ">", threeSecondsAgo)
                            .executeTakeFirstOrThrow();
    return Number(onlineUsers.count);
});


export const useChatMessages = livingData(getRecentChatMessages);
export const useOnlineUserCount = livingData(getOnlineUsersCount)

export const Chat = component$((props: { 
    startingMessages: Array<
        Omit<Selectable<DB["chat_messages"]>, "id" | "ip">
        & Pick<Selectable<DB["users"]>, "nickname">
    >,
    startingOnlineUserCount: number,
}) => {

  useStylesScoped$(styles);
  const chatMessages = useChatMessages({ 
      startingValue: props.startingMessages,
      interval: 180
  });
  const onlineUserCount = useOnlineUserCount({
        startingValue: props.startingOnlineUserCount,
        interval: 1000
  })
  const username = useUsername();
  const currentMessage = useSignal("");
  const error = useSignal("");
  const errorRemovalTimeout = useSignal(-1)
  useTask$(({track})=> { 
    track(()=> error.value);
    clearTimeout(errorRemovalTimeout.value);
    if (error.value) { 
        errorRemovalTimeout.value = setTimeout(()=> { 
            error.value = "";
        }, 1000) as unknown as number
    }
  });
  
  useVisibleTask$(({cleanup})=> { 
    heartbeat();
    const intervalTimer = setInterval(()=> {
        heartbeat()
    }, 1000)
    cleanup(()=>  clearInterval(intervalTimer));
  })


  const submitMessage = $(async ()=> { 
    if (currentMessage.value) { 
      const message = currentMessage.value.endsWith("\n") ? currentMessage.value.slice(0, -1) : currentMessage.value;
      currentMessage.value = "";
      await sendChatMessage(message).then(result => { 
        if (result !== "Success") { 
            currentMessage.value = message; //don't want to swallow the message, give a chance to retry.
            error.value = result;
        }
      });
    }
  });

  const messagesRef = useSignal<Element>();

  return (
    <section>
      <h2>Have a Chat</h2>
      <h3><SimpleMultipleUsersIcon />{onlineUserCount.signal.value} {`User`}{onlineUserCount.signal.value === 1 ? '' :'s'}{` Online`}</h3>
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
            onKeyDown$={async (event)=> { 
                if (event.key === "Enter" && !event.shiftKey) { 
                    await submitMessage();
                    currentMessage.value = "";
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


export const heartbeat = server$(async function() {
    const ip = getIp(this);
    await  getDb(this).updateTable("users").set({ last_active:  new Date() }).where("ip", "=", ip).execute();
 })

export const sendChatMessage = server$(async function(message: string) {
    if (message.length > 300) { 
        return "Message too long; max 300 characters." as const;
    }
    const db = getDb(this);
    const ip = getIp(this);
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
    if (Number(recentMessagesFromThisIp.count) > MAX_ALLOWED_MESSAGES_PER_MINUTE) {
        return "Too many messages in a short period." as const;
    }

    await db.insertInto("chat_messages").values({message_text: message, ip}).execute();
    return "Success" as const;
});



export function stringToDarkColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '';
    for (let i = 0; i < 3; i++) {
        let value = Math.abs((hash >> (i * 8)) & 0xFF);
        value = Math.floor(value * 0.6); // This ensures the color is always somewhat dark
        color += value.toString(16).padStart(2, '0')
    }

    return '#' + color;
}
