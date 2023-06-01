import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { routeLoader$, type RequestHandler } from '@builder.io/qwik-city';

import Footer from '~/components/starter/footer/footer';
import Header from '~/components/starter/header/header';

import { initializeDb } from '~/database/planetscale';
import styles from './styles.css?inline';

export const useServerTimeLoader = routeLoader$(() => {
  return {
    date: new Date().toISOString(),
  };
});

export const onRequest: RequestHandler = async (event) => { 
  const dbHost = event.env.get("DATABASE_HOST");
  const dbUsername = event.env.get("DATABASE_USERNAME");
  const dbPassword = event.env.get("DATABASE_PASSWORD");
  if (!dbHost || !dbUsername || !dbPassword) {
    throw new Error("Missing database credentials");
  }
  initializeDb({ 
    host: dbHost,
    username: dbUsername,
    password: dbPassword,
  })
}

export default component$(() => {
  useStyles$(styles);
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
