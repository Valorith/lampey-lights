import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const designs = sqliteTable("designs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  revision: integer("revision").notNull(),
  updated: integer("updated").notNull()
});
