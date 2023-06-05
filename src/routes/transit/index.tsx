import { component$, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";
import { XMLParser } from "fast-xml-parser";
import { BusIcon } from "~/components/icons";
import { livingData } from "~/living-data/living-data";
import { TRANSIT_AGENCIES } from "./transit-routes";
import { findBoundingBox } from "~/geography-functions/geography-functions";

export const getVehiclesInfo = server$(async function (agency: keyof typeof TRANSIT_AGENCIES) {
    const routesOfVehicles = await Promise.all(TRANSIT_AGENCIES[agency].routeTags.map(async (tag) => {
        return getLiveVehiclesInfo(agency, tag)
    }))
    const vehicles = routesOfVehicles.flat();
    return vehicles;
});

export const useLoadedVehiclesInfo = routeLoader$((event) =>
    getVehiclesInfo.call(event, "Jacksonville Transportation Authority")
);
export const useVehiclesInfo = livingData(getVehiclesInfo);

export const STARTING_ROTATION = -120 as const;
export default component$(() => {
    const loadedValues = useLoadedVehiclesInfo().value;
    const vehicles = useVehiclesInfo({
        initialArgs: ["Jacksonville Transportation Authority"],
        startingValue: loadedValues,
        interval: 15000,
    });
    const vehicleInfo = useSignal(loadedValues);

    const _normalizedPositionById: Record<string, number> = {}
    loadedValues.forEach(vehicle => {
        _normalizedPositionById[vehicle.id] = normalizeTo360(Number(vehicle.heading));
    });
    const normalizedPositionById = useSignal(_normalizedPositionById);

    useVisibleTask$(({ track }) => {
        track(() => vehicles.signal.value);
        const bounding = findBoundingBox(vehicles.signal.value.map(v => ({ lat: Number(v.lat), lon: Number(v.lon) })));
        console.log(bounding);
        const oldHeadingById = new Map<string, string>();
        vehicleInfo.value.forEach(vehicle => {
            oldHeadingById.set(vehicle.id, vehicle.heading);
        });
        const newNormalizedPositionsById: Record<string, number> = {}
        vehicles.signal.value.forEach(vehicle => {
            const oldHeading = oldHeadingById.get(vehicle.id);
            const amountToRotate = shortestAngle(
                normalizeTo360(Number(oldHeading)),
                normalizeTo360(Number(vehicle.heading))
            );
            newNormalizedPositionsById[vehicle.id] = normalizedPositionById.value[vehicle.id] + amountToRotate;
        });
        normalizedPositionById.value = newNormalizedPositionsById;
        vehicleInfo.value = vehicles.signal.value;
    });
    useStylesScoped$(`  
    section { 
      display: flex;
      flex-wrap: wrap;
      gap: 40px;
    }
    div { 
        width: -moz-fit-content;
        width: fit-content;
    }
    .rotator { 
        transition: transform 3s ease-in-out;
    }
    .vehicle { 
        font-size: 10px
    }
  `);


    return (
        <main>
            <section>
                {vehicleInfo.value
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((vehicle) => {
                        const heading = normalizeTo360(Number(vehicle.heading));
                        const rotation = normalizedPositionById.value[vehicle.id];
                        return (
                            <div class="vehicle" key={vehicle.id + '-a'}>
                                {vehicle.id}
                                <div key={vehicle.id + '-b'} style={{ transform: `rotate(${heading > 180 ? STARTING_ROTATION * -1 : STARTING_ROTATION}deg)` }}>
                                    <div key={vehicle.id + '-c'} class="rotator" style={{ transform: `rotate(${rotation}deg)` }}>
                                        <BusIcon
                                            height={20}
                                            width={20}
                                            style={{ transform: `${heading > 180 ? "scaleX(-1)" : ""}` }}
                                        />
                                    </div>
                                </div>
                                <br />
                                {vehicle.lat.slice(0,5)}<br /> {vehicle.lon.slice(0,5)} <br />
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


function shortestAngle(oldAngle: number, newAngle: number): number {
    const diff = (newAngle - oldAngle + 180) % 360 - 180;
    return diff < -180 ? diff + 360 : diff;
}

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
        console.log("No vehicles found")
        return [];
    }
    if (!Array.isArray(json.body.vehicle)) { 
        json.body.vehicle = [json.body.vehicle];
    }
    return json.body.vehicle.map((vehicle) => ({
        id: vehicle["@_id"],
        lat: vehicle["@_lat"],
        lon: vehicle["@_lon"],
        // secsSinceReport: vehicle["@_secsSinceReport"],
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
