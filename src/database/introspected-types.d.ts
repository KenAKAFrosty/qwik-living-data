import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface Employees {
  id: Generated<number>;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface DB {
  employees: Employees;
}
