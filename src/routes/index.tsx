import {
    component$,
    useStylesScoped$
} from "@builder.io/qwik";
import { routeLoader$, server$, type DocumentHead } from "@builder.io/qwik-city";

import Counter from "~/components/starter/counter/counter";
import Hero from "~/components/starter/hero/hero";
import Infobox from "~/components/starter/infobox/infobox";
import Starter from "~/components/starter/next-steps/next-steps";
import { livingData } from "./living-data";

export default component$(() => {
    return (
        <>
            <IssLocation />
            <Hero />
            <Starter />

            <div role="presentation" class="ellipsis"></div>
            <div role="presentation" class="ellipsis ellipsis-purple"></div>

            <div class="container container-center container-spacing-xl">
                <h3>
                    You can <span class="highlight">count</span>
                    <br /> on me
                </h3>
                <Counter />
            </div>

            <div class="container container-flex">
                <Infobox>
                    <div q:slot="title" class="icon icon-cli">
                        CLI Commands
                    </div>
                    <>
                        <p>
                            <code>npm run dev</code>
                            <br />
                            Starts the development server and watches for changes
                        </p>
                        <p>
                            <code>npm run preview</code>
                            <br />
                            Creates production build and starts a server to preview it
                        </p>
                        <p>
                            <code>npm run build</code>
                            <br />
                            Creates production build
                        </p>
                        <p>
                            <code>npm run qwik add</code>
                            <br />
                            Runs the qwik CLI to add integrations
                        </p>
                    </>
                </Infobox>

                <div>
                    <Infobox>
                        <div q:slot="title" class="icon icon-apps">
                            Example Apps
                        </div>
                        <p>
                            Have a look at the <a href="/demo/flower">Flower App</a> or the{" "}
                            <a href="/demo/todolist">Todo App</a>.
                        </p>
                    </Infobox>

                    <Infobox>
                        <div q:slot="title" class="icon icon-community">
                            Community
                        </div>
                        <ul>
                            <li>
                                <span>Questions or just want to say hi? </span>
                                <a href="https://qwik.builder.io/chat" target="_blank">
                                    Chat on discord!
                                </a>
                            </li>
                            <li>
                                <span>Follow </span>
                                <a href="https://twitter.com/QwikDev" target="_blank">
                                    @QwikDev
                                </a>
                                <span> on Twitter</span>
                            </li>
                            <li>
                                <span>Open issues and contribute on </span>
                                <a href="https://github.com/BuilderIO/qwik" target="_blank">
                                    GitHub
                                </a>
                            </li>
                            <li>
                                <span>Watch </span>
                                <a href="https://qwik.builder.io/media/" target="_blank">
                                    Presentations, Podcasts, Videos, etc.
                                </a>
                            </li>
                        </ul>
                    </Infobox>
                </div>
            </div>
        </>
    );
});


export const getIssLocation = server$(async function() { 
    const result = await fetch("http://api.open-notify.org/iss-now.json").then(r => r.json());
    return result as { 
        iss_position: {
            latitude: string;
            longitude: string;
        },
        message: string;
        timestamp: number;
    }
})
export const useLoadedIssLocation = routeLoader$((event) => getIssLocation.call(event))
export const useIssLocation = livingData(getIssLocation);



export const IssLocation = component$(() => {

    const loadedLocation = useLoadedIssLocation();
    const iss = useIssLocation({
        startingValue: loadedLocation.value,
        interval: 1000
    });


    useStylesScoped$(`
        section { 
            margin: auto;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            font-size: 22px;
            margin-bottom: 80px;
        }
    `);
    return (
        <>
            <section>
                <h2>Current ISS Location</h2>
                <h3>Latitude: {iss.signal.value.iss_position.latitude}</h3>
                <h3>Longitude: {iss.signal.value.iss_position.longitude}</h3>
            </section>
        </>
    );
});

export const head: DocumentHead = {
    title: "Welcome to Qwik",
    meta: [
        {
            name: "description",
            content: "Qwik site description",
        },
    ],
};
