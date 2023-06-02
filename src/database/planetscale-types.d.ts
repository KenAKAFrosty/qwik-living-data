import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface ChatMessages {
  id: Generated<number>;
  timestamp: Generated<Date | null>;
  ip: string;
  message_text: string;
}

export interface Users {
  id: Generated<number>;
  ip: string;
  nickname: string;
  last_active: Date | null;
}

export interface DB {
  chat_messages: ChatMessages;
  users: Users;
}
