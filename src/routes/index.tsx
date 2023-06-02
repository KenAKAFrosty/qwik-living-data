import { component$, useComputed$, useStylesScoped$ } from "@builder.io/qwik";
import {
  routeLoader$,
  server$,
  type DocumentHead,
//   type RequestHandler,
} from "@builder.io/qwik-city";

import { SpaceStationIcon } from "~/components/icons";
import {
  Chat,
  getOnlineUsersCount,
  getRecentChatMessages,
} from "~/components/living-data-examples/chat";
import {
  WeatherAndBikes,
  getWeather,
} from "~/components/living-data-examples/weather-and-bikes";
import Counter from "~/components/starter/counter/counter";
import Hero from "~/components/starter/hero/hero";
import Infobox from "~/components/starter/infobox/infobox";
import { livingData } from "../living-data/living-data";
// import { XMLParser } from "fast-xml-parser";

// export const onGet: RequestHandler = async (event) => {
//   event;
//   const parser = new XMLParser({
//     ignoreAttributes: false,
//   });
//   const metroData = await fetch(
//     "https://retro.umoiq.com/service/publicXMLFeed?command=agencyList"
//   ).then((r) => r.text());
//   const json = parser.parse(metroData);
//   const agencyTags = json.body.agency.map(
//     (a: {
//       "@_tag": string;
//       "@_title": string;
//       "@_regionTitle": string;
//       "@_shortTitle"?: string;
//     }) => a["@_tag"]
//   );
//   console.log(agencyTags);
//   const routeTags: Array<{
//     agency: string;
//     route: string;
//   }> = [];
//   const routes = Promise.all(
//     agencyTags.map(async (tag) => {
//       const endpoint = `https://retro.umoiq.com/service/publicXMLFeed?command=routeList&a=${tag}`;
//       const thisResponse = await fetch(endpoint)
//         .then((r) => r.text())
//         .then((r) => parser.parse(r));
//       console.log(thisResponse);
//       const theseRoutes = thisResponse.body.route;
//       console.log(theseRoutes);
//       const theseRouteTags = !Array.isArray(theseRoutes)
//         ? [theseRoutes["@_tag"]]
//         : theseRoutes.map(
//             (r: { "@_tag": string; "@_title": string }) => r["@_tag"]
//           );
//       console.log(theseRouteTags);
//       routeTags.push(
//         ...theseRouteTags.map((routeTag) => ({
//           agency: tag,
//           route: routeTag
//         }))
//       );
//       console.log(routeTags);
//     })
//   );
// };

export const useWeatherLoader = routeLoader$((event) => getWeather.call(event));
export const useChatMessagesLoader = routeLoader$((event) =>
  getRecentChatMessages.call(event)
);
export const useOnlineUserCountLoader = routeLoader$((event) =>
  getOnlineUsersCount.call(event)
);
export default component$(() => {
  const loadedWeather = useWeatherLoader();
  const loadedChatMessages = useChatMessagesLoader();
  const loadedOnlineUserCount = useOnlineUserCountLoader();
  return (
    <>
      <Iss />
      <Chat
        startingMessages={loadedChatMessages.value}
        startingOnlineUserCount={loadedOnlineUserCount.value}
      />
      <WeatherAndBikes startingWeather={loadedWeather.value} />
      <Hero />

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

export const getIssLocation = server$(async function () {
  const result = await fetch("http://api.open-notify.org/iss-now.json").then(
    (r) => r.json()
  );
  return result as {
    iss_position: {
      latitude: string;
      longitude: string;
    };
    message: string;
    timestamp: number;
  };
});

export const useIssLocationLoader = routeLoader$((event) =>
  getIssLocation.call(event)
);

export const useIssLocation = livingData(getIssLocation);

export const Iss = component$(() => {
  const interval = 300;
  const iss = useIssLocation({
    startingValue: useIssLocationLoader().value,
    interval,
  });
  const mercatorProjection = useComputed$(() => {
    return {
      x:
        (earthSize / 2) *
        (Number(iss.signal.value.iss_position.longitude) / 180),
      y:
        (earthSize / 2) *
        (-Number(iss.signal.value.iss_position.latitude) / 90),
    };
  });
  const earthSize = 360;
  const issSize = 50;
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
        p { 
            display: inline;
        }

        div { 
            height: ${earthSize}px;
            width: ${earthSize}px;
            border: 1px solid var(--qwik-light-purple);
            border-radius: 50%;
            position: relative;
        }

        span { 
            height: ${issSize}px;
            width: ${issSize}px;
            border-radius: 50%;
            position: absolute;
            top: calc(50% - ${issSize / 2}px);
            left: calc(50% - ${issSize / 2}px);
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 12px;
            transition: transform ${interval}ms ease-out;
        }
    `);
  return (
    <>
      <section>
        <h2>Current ISS Location</h2>
        <p>
          Latitude: {iss.signal.value.iss_position.latitude} | Longitude:{" "}
          {iss.signal.value.iss_position.longitude}
        </p>
        <div>
          <span
            style={{
              transform: `translate(${mercatorProjection.value.x}px, ${mercatorProjection.value.y}px`,
            }}
          >
            <SpaceStationIcon />
          </span>
        </div>
      </section>
    </>
  );
});

export const head: DocumentHead = (event) => {
  const iss = event.resolveValue(useIssLocationLoader);

  return {
    title: "Qwik - Living Data",
    meta: [
      {
        name: "description",
        content: `Current ISS Position: Latitude: ${iss.iss_position.latitude} | Longitude: ${iss.iss_position.longitude}`,
      },
    ],
  };
};
