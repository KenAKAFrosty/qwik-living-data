import { Kysely } from "kysely";
import { PlanetScaleDialect } from "kysely-planetscale";
import { type DB } from "./planetscale-types";
import { type RequestEventBase } from "@builder.io/qwik-city";

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

export function getDb(event?: RequestEventBase) {
  if (!db) {
    if (!event) {
      throw new Error("DB hasn't been initialized yet.");
    }
    const dbHost = event.env.get("DATABASE_HOST");
    const dbUsername = event.env.get("DATABASE_USERNAME");
    const dbPassword = event.env.get("DATABASE_PASSWORD");
    if (!dbHost || !dbUsername || !dbPassword) {
      throw new Error(
        "Provided request event to initialize database, but it's missing database credentials"
      );
    }
    const connectionInfo = {
      host: dbHost,
      username: dbUsername,
      password: dbPassword,
    };
    initializeDb(connectionInfo);
  }

  return db;
}
