// import {XMLParser} from "fast-xml-parser"

import { type RequestHandler } from "@builder.io/qwik-city";

export const onGet: RequestHandler = async (event) => {
        
    event.json(200, {message: "Hello, world!"});
}

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