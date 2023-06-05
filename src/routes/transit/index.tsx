import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";
import { XMLParser } from "fast-xml-parser";
import { BusIcon } from "~/components/icons";
import { livingData } from "~/living-data/living-data";
import { TRANSIT_AGENCIES } from "./transit-routes";

export const getVehiclesInfo = server$(async function () {
  const vehicles = await getLiveVehiclesInfo("San Francisco Muni Sandbox", "1");
  return vehicles;
});

export const useLoadedVehiclesInfo = routeLoader$((event) =>
  getVehiclesInfo.call(event)
);
export const useVehiclesInfo = livingData(getVehiclesInfo);

export const STARTING_ROTATION = -120 as const;
export default component$(() => {
  const vehicles = useVehiclesInfo({
    startingValue: useLoadedVehiclesInfo().value,
    interval: 5000,
  });

  useStylesScoped$(` 
    section { 
      display: flex;
      flex-wrap: wrap;
      gap: 40px;
    }
  `);
  return (
    <main>
      <section>
        {vehicles.signal.value
          .sort((a, b) => {
            if (a.speedKmHr === "0") {
              return 1;
            }
            if (b.speedKmHr === "0") {
              return -1;
            }
            return 0;
          })
          .map((vehicle) => {
            const heading = normalizeTo360(-40); //normalizeTo360(Number(vehicle.heading));
            const basePosition = (STARTING_ROTATION + heading) * -1;
            console.log({ heading });
            return (
              <div class="agency" key={vehicle.id}>
                {vehicle.id}
                  <BusIcon
                    height={50}
                    width={50}
                    style={{
                      transform: `rotate(${basePosition}deg) scaleY(-1)`,
                    }}
                  />
                <br />
                {vehicle.lat} {vehicle.lon} <br />
                {degreesToCompass(heading)} {vehicle.heading}
                <br />
                {vehicle.speedKmHr === "0"
                  ? "Stopped"
                  : `${vehicle.speedKmHr} km/h`}
              </div>
            );
          })}
      </section>
    </main>
  );
});

export async function getLiveVehiclesInfo<
  AGENCY extends keyof typeof TRANSIT_AGENCIES
>(
  agencyTitle: AGENCY,
  routeTag: (typeof TRANSIT_AGENCIES)[AGENCY]["routeTags"][number]
) {
  const url = new URL(`https://retro.umoiq.com/service/publicXMLFeed`);
  url.searchParams.set("command", "vehicleLocations");
  url.searchParams.set("a", TRANSIT_AGENCIES[agencyTitle].tag);
  url.searchParams.set("r", routeTag);
  url.searchParams.set("t", "1");
  const xmlResponse = await fetch(url.toString()).then((res) => res.text());
  const parser = new XMLParser({
    ignoreAttributes: false,
  });
  const json = parser.parse(xmlResponse) as {
    "?xml": { "@_version": string; "@_encoding": string };
    body: {
      "@_copyright": string;
      lastTime: { "@_time": `${number}` };
      Error: {
        "#text": string;
        "@_shouldRetry": "false" | "true";
      };
      vehicle?: Array<{
        "@_id": string;
        "@_lat": `${number}`;
        "@_lon": `${number}`;
        "@_secsSinceReport": `${number}`;
        "@_predictable": "true" | "false";
        "@_heading": `${number}`;
        "@_speedKmHr": `${number}`;
      }>;
    };
  };
  if (!json.body.vehicle) {
    return [];
  }
  return json.body.vehicle.map((vehicle) => ({
    id: vehicle["@_id"],
    lat: vehicle["@_lat"],
    lon: vehicle["@_lon"],
    secsSinceReport: vehicle["@_secsSinceReport"],
    predictable: vehicle["@_predictable"],
    heading: vehicle["@_heading"],
    speedKmHr: vehicle["@_speedKmHr"],
  }));
}

export function degreesToCompass(degrees: number): string {
  const normalized = normalizeTo360(degrees);
  const compassPoints = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const degreesPerDirection = 360 / compassPoints.length;
  const shiftAmount = degreesPerDirection / 2;
  const index =
    Math.floor((normalized + shiftAmount) / degreesPerDirection) %
    compassPoints.length;
  return compassPoints[index];
}

export function normalizeTo360(degrees: number) {
  const normalized = degrees % 360;
  if (normalized < 0) {
    return normalized + 360;
  } else {
    return normalized;
  }
}
