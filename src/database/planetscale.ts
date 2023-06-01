import { Kysely } from "kysely";
import { PlanetScaleDialect } from "kysely-planetscale";
import { type DB } from "./planetscale-types";

let db: Kysely<DB>;

export function initializeDb(connectionInfo: {
  host: string;
  username: string;
  password: string;
}) {
  if (!db) {
    db = new Kysely<DB>({
      dialect: new PlanetScaleDialect({
        host: connectionInfo.host,
        username: connectionInfo.username,
        password: connectionInfo.password,
        useSharedConnection: true,
      }),
    });
  }
}

export function getDb() {
  if (!db) {
    throw new Error(
      "DB hasn't been initialized yet."
    );
  }

  return db;
}
