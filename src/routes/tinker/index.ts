import { server$, type RequestHandler } from "@builder.io/qwik-city";
import { sql } from "kysely";
import { getDb } from "~/database/planetscale";
import { getIp, nickname } from "~/users/functions";
//https://github.com/ably/ably-js#using-the-realtime-api
export const onGet: RequestHandler = async (event) => {
    event.text(200, "hey");
};

export const listenToAblyStream = server$(async function* (channel: string) {
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
    let buffer = "";
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
                        id: string;
                        timestamp: number;
                        channel: string;
                        name: string;
                        data: string;
                    };
                }
            }
            buffer = "";
        }
    }
});

export const sendAblyMessage = server$(async function (message: string) {
    const endpoint = new URL(`https://rest.ably.io/channels/getting-started/messages`);
    const key = this.env.get("ABLY_KEY");
    if (!key) {
        throw new Error("Critical access information is missing");
    }
    const nick = await nickname.call(this);
    await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${btoa(key)}`,
        },
        body: JSON.stringify({
            name: nick,
            data: message,
        }),
    });    
});

export const sendChatMessage = server$(async function (message: string) {
    if (message.length > 300) {
        return "Message too long; max 300 characters." as const;
    }
    const db = getDb(this);
    const ip = getIp(this);
    if (!ip) {
        return "Unexpected error. Please try again later." as const;
    }

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

    await db.insertInto("chat_messages").values({ message_text: message, ip }).execute();
    return "Success" as const;
});
