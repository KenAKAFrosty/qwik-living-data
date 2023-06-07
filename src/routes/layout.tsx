import { component$, Slot, useStyles$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

import Footer from "~/components/starter/footer/footer";
import Header from "~/components/starter/header/header";

import styles from "./styles.css?inline";
import { nickname } from "~/users/functions";

export const useServerTimeLoader = routeLoader$(() => {
    return {
        date: new Date().toISOString(),
    };
});

export const useUsername = routeLoader$(async (event) =>  nickname.call(event));


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
