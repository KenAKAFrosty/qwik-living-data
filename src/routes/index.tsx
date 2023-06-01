import { component$, useComputed$, useStylesScoped$, useTask$ } from "@builder.io/qwik";
import {
  routeLoader$,
  server$,
  type DocumentHead,
} from "@builder.io/qwik-city";

import Counter from "~/components/starter/counter/counter";
import Hero from "~/components/starter/hero/hero";
import Infobox from "~/components/starter/infobox/infobox";
import Starter from "~/components/starter/next-steps/next-steps";
import { livingData } from "./living-data";
import { SpaceStationIcon } from "~/components/icons";


export default component$(() => {
  return (
    <>
      <Iss />
      <WeatherAndBikes />
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
  const loadedLocation = useIssLocationLoader();
  const interval = 300;
  const iss = useIssLocation({
    startingValue: loadedLocation.value,
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



export const latLonByCity = {
    London: { lat: 51.50706, lon: -0.1285 },
    "New York": { lat: 40.71427, lon: -74.00597 },
    Melbourne: { lat: -37.814, lon: 144.96332 },
    Madrid: { lat: 40.4165, lon: -3.70256 },
    "São Paulo": { lat: -23.5475, lon: -46.63611 },
    "San Francisco": { lat: 37.77713, lon: -122.41964 },
  };
  
  export const cityBikesIdByCity: {[Key in keyof typeof latLonByCity]: string} = {
      London: "santander-cycles",
      "New York": "citi-bike-nyc",
      Melbourne: "monash-bikeshare",
      Madrid: "bicimad",
      "San Francisco": "bay-wheels",
      "São Paulo": "bikesampa"
  }
  
  
  type Weather = {
      coord: {
          lon: number;
          lat: number;
      };
      weather: {
          id: number;
          main: string;
          description: string;
          icon: string;
      }[];
      base: string;
      main: {
          temp: number;
          feels_like: number;
          temp_min: number;
          temp_max: number;
          pressure: number;
          humidity: number;
      };
      visibility: number;
      wind: {
          speed: number;
          deg: number;
      };
      clouds: {
          all: number;
      };
      dt: number;
      sys: {
          type: number;
          id: number;
          country: string;
          sunrise: number;
          sunset: number;
      };
      timezone: number;
      id: number;
      name: string;
      cod: number;
  }
  
  
  
  type BikesData = { 
      network: { 
          stations: Array<{
              empty_slots: number;
              free_bikes: number;
              extra: { 
                  normal_bikes: number;
                  ebikes: number;
                  renting: number;
                  returning: number;
                  slots: number;
              }
          }>
      }
  }
  
  
export const getWeather = server$(async function() {
    const key = this.env.get("OPEN_WEATHER_API_KEY");
    const weatherByCity: {[Key in keyof typeof latLonByCity]?: Weather} = {};
    await Promise.all(Object.keys(latLonByCity).map(async (_city) => {
        const city = _city as keyof typeof latLonByCity;
        const coords = latLonByCity[city];
        const thisWeather = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${key}&units=metric`
        ).then((r) => r.json())  as Weather;
        weatherByCity[city] = thisWeather;
    }));
    return weatherByCity as { [Key in keyof typeof latLonByCity]: Weather };  
})

export const useWeatherLoader = routeLoader$(async (event) => getWeather.call(event));
export const useWeather = livingData(getWeather);
  
export const getCityBikes = server$(async function() {
    console.log('Firing get city bikes')
    const baseUrl = "https://api.citybik.es/v2/networks/";
    const emptySlotsByCity: {[Key in keyof typeof latLonByCity]?: string} = {};
    await Promise.all(Object.keys(latLonByCity).map(async (_city) => {  
        const city = _city as keyof typeof latLonByCity;
        const id = cityBikesIdByCity[city];
        const cityBikes = await fetch(baseUrl + id).then((r) => r.json()) as BikesData;

        let emptySlots = 0;
    
        cityBikes.network.stations.forEach((station) => {
            emptySlots += (station.empty_slots || 0);
        });
    
        emptySlotsByCity[city] = emptySlots.toString();
    }));
    return emptySlotsByCity as { [Key in keyof typeof latLonByCity]: string };
});

export const useCityBikes = livingData(getCityBikes);

export const WeatherAndBikes = component$(() => {
    const weather = useWeather({ 
        startingValue: useWeatherLoader().value,
        interval: 20000
    });
    const cityBikes = useCityBikes({ 
        interval: 10000,
        startingValue: { 
            "New York": "~",
            "San Francisco": "~",
            "São Paulo": "~",
            London: "~",
            Madrid: "~",
            Melbourne: "~"
        }
    });

    useStylesScoped$(`
        section { 
            margin: auto;
            text-align: center;
            padding: 8px;
        }
        h2 { 
            margin: auto;
        }
        h4 { 
            margin-bottom: 4px;
            font-weight: normal;
            font-size: 14px;
        }
        hr{ 
            border: none;
            height: 1px;
            background: linear-gradient(170deg, var(--qwik-light-purple), var(--qwik-dark-blue));
            width: 50%;
        }
        .cities { 
            margin: auto;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 620px;
            padding: 24px;
            gap: 12px
        }
        .city { 
            padding: 12px;
            border: 1px solid var(--qwik-light-purple);
            border-radius: 8px;
            width: 170px;
        }
        .name { 
            font-size: 24px;
        }
        .bikes { 
            font-size: 28px;
            margin: 0;
        }
    `)
    return <section>
        <h2>Around the World Right Now</h2>
        <div class="cities">
            {Object.keys(latLonByCity).map((city, i) => {
                return <div class="city" key={city + i}>
                    <h3 class="name">{city}</h3>
                    {weather.signal.value[city as keyof typeof latLonByCity] && <p>
                        {weather.signal.value[city as keyof typeof latLonByCity].main.temp}°C
                    </p>}
                    <hr />
                    <h4>CityBike Empty Slots</h4>
                    <p class="bikes">{cityBikes.signal.value[city as keyof typeof latLonByCity]}</p>
                </div>
            })}
        </div>
    </section>
})

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

