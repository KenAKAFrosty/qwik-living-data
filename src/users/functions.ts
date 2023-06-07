import { RequestEventBase, server$ } from "@builder.io/qwik-city";
import { randAccessory, randAnimal, randColor } from "@ngneat/falso";
import { getDb } from "~/database/planetscale";


/** Has some side effects; updates database with user/last_seen time */
export const nickname = server$(async function () { 
    const headers = this.request.headers;
    const ip =
        this.url.hostname === "localhost"
            ? "dev"
            : headers.get("x-forwarded-for") || headers.get("x-real-ip") || headers.get("x-vercel-proxied-for");
    if (!ip) {
        throw new Error("Highly unexpected behavior; unknown accessor");
    }
    const db = getDb(this);
    const user = await db.selectFrom("users").selectAll().where("ip", "=", ip).executeTakeFirst();
    const now = new Date();
    if (!user) {
        const nickname =
            spacedToTitleCase(randColor()) + spacedToTitleCase(randAnimal()) + spacedToTitleCase(randAccessory());
        const newUser = { ip, last_active: now, nickname };
        await db.insertInto("users").values(newUser).execute();
        return nickname;
    } else {
        await db.updateTable("users").set({ last_active: now }).where("id", "=", user.id).execute();
        return user.nickname;
    }
});

function spacedToTitleCase(str: string) {
    return str
        .split(" ")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join("");
}

export function getIp(event: RequestEventBase) { 
    const headers = event.request.headers;
    return event.url.hostname === "localhost" ? "dev" : headers.get("x-forwarded-for") || headers.get("x-real-ip") || headers.get("x-vercel-proxied-for");
}
