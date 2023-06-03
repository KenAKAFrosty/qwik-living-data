import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { livingData } from "~/living-data/living-data";

export const latLonByCity = {
    London: { lat: 51.50706, lon: -0.1285 },
    "New York": { lat: 40.71427, lon: -74.00597 },
    Melbourne: { lat: -37.814, lon: 144.96332 },
    Madrid: { lat: 40.4165, lon: -3.70256 },
    "São Paulo": { lat: -23.5475, lon: -46.63611 },
    "San Francisco": { lat: 37.77713, lon: -122.41964 },
};
  
export const cityBikesIdByCity: { [Key in keyof typeof latLonByCity]: string } =
    {
      London: "santander-cycles",
      "New York": "citi-bike-nyc",
      Melbourne: "monash-bikeshare",
      Madrid: "bicimad",
      "San Francisco": "bay-wheels",
      "São Paulo": "bikesampa",
    };



export const getCityBikes = server$(async function () {
    const baseUrl = "https://api.citybik.es/v2/networks/";
    const emptySlotsByCity: { [Key in keyof typeof latLonByCity]?: string } = {};
    await Promise.all(
        Object.keys(latLonByCity).map(async (_city) => {
        const city = _city as keyof typeof latLonByCity;
        const id = cityBikesIdByCity[city];
        const cityBikes = (await fetch(baseUrl + id).then((r) =>
            r.json()
        )) as BikesData;
    
        let emptySlots = 0;
    
        cityBikes.network.stations.forEach((station) => {
            emptySlots += station.empty_slots || 0;
        });
    
        emptySlotsByCity[city] = emptySlots.toString();
        })
    );
    return emptySlotsByCity as { [Key in keyof typeof latLonByCity]: string };
});


export const getWeather = server$(async function () {
    const weatherByCity: { [Key in keyof typeof latLonByCity]?: Weather } = {};
    await Promise.all(
      Object.keys(latLonByCity).map(async (_city) => {
        const city = _city as keyof typeof latLonByCity;
        const coords = latLonByCity[city];
        const thisWeather = (await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true`
        ).then((r) => r.json())) as Weather;
        weatherByCity[city] = thisWeather;
      })
    );
    return weatherByCity as { [Key in keyof typeof latLonByCity]: Weather };
});
      
      
export const useCityBikes = livingData(getCityBikes);
export const useWeather = livingData(getWeather);

export const WeatherAndBikes = component$((props: { 
    startingWeather: Awaited<ReturnType<typeof getWeather>>,
}) => {
    const weather = useWeather({
      startingValue: props.startingWeather,
      interval: 30000,
    });
    const cityBikes = useCityBikes({
      interval: 10000,
      startingValue: {
        "New York": "~",
        "San Francisco": "~",
        "São Paulo": "~",
        London: "~",
        Madrid: "~",
        Melbourne: "~",
      },
    });
  
    useStylesScoped$(`
          section { 
              margin: auto;
              text-align: center;
              padding: 24px 8px;
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
              background: linear-gradient(170deg, #ac7ff422, var(--qwik-light-purple), var(--qwik-dark-blue), #006ce922);
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
    `);
  
    return (
      <section>
        <h2>Around the World Right Now</h2>
        <div class="cities">
          {Object.keys(latLonByCity).map((city, i) => {
            return (
              <div class="city" key={city + i}>
                <h3 class="name">{city}</h3>
                {weather.signal.value[city as keyof typeof latLonByCity] && (
                  <p>
                    {weather.signal.value[city as keyof typeof latLonByCity].current_weather.temperature}°C
                  </p>
                )}
                <hr />
                <h4>Bicycles currently shared</h4>
                <p class="bikes">
                  {cityBikes.signal.value[city as keyof typeof latLonByCity]}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    );
  });
  

  
export type Weather = {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_weather: {
      temperature: number;
      windspeed: number;
      winddirection: number;
      weathercode: number;
      is_day: number;
      time: string;
  };
}
  
export type BikesData = {
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
        };
      }>;
    };
  };
  