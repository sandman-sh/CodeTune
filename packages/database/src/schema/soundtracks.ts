import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const soundtracksTable = pgTable("soundtracks", {
  id: serial("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  repoName: text("repo_name").notNull(),
  mode: text("mode").notNull(),
  genre: text("genre").notNull(),
  generationType: text("generation_type").notNull(),
  lyrics: text("lyrics"),
  audioUrl: text("audio_url"),
  duration: real("duration"),
  musicParams: text("music_params"),   // JSON: BPM, mood, scale, timbre, energy…
  codeMetrics: text("code_metrics"),   // JSON: functions, stars, language, lines…
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSoundtrackSchema = createInsertSchema(soundtracksTable).omit({ id: true, createdAt: true });
export type InsertSoundtrack = z.infer<typeof insertSoundtrackSchema>;
export type Soundtrack = typeof soundtracksTable.$inferSelect;
