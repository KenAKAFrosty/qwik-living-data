import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

import Footer from '~/components/starter/footer/footer';
import Header from '~/components/starter/header/header';

import { getDb } from '~/database/planetscale';
import styles from './styles.css?inline';

import { randAccessory, randAnimal, randColor } from "@ngneat/falso";

export const useServerTimeLoader = routeLoader$(() => {
  return {
    date: new Date().toISOString(),
  };
});

export const useUsername =  routeLoader$(async (event) => { 
  const headers = event.request.headers;
  const ip = event.url.hostname === "localhost" ? "dev" : headers.get("x-forwarded-for") || headers.get("x-real-ip") || headers.get("x-vercel-proxied-for") ;
  const db = getDb(this);
  if (ip) { 
    const user = await db.selectFrom("users").selectAll().where("ip", "=", ip).executeTakeFirst();
    const now = new Date();
    if (!user) { 
      const nickname = spacedToTitleCase(randColor()) + spacedToTitleCase(randAnimal()) + spacedToTitleCase(randAccessory())
      const newUser = { ip, last_active: now, nickname }
      await db.insertInto("users").values(newUser).execute();
      return nickname;
    } else { 
      await db.updateTable("users").set({ last_active: now }).where("id", "=", user.id).execute();
      return user.nickname;
    }
  }
})


function spacedToTitleCase(str: string) { 
  return str.split(" ").map((word) => word[0].toUpperCase() + word.slice(1)).join("");
}

export default component$(() => {
  useStyles$(styles);
  useUsername();
  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </>
  );
});
