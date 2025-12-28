import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const prolificSessions = pgTable("prolific_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  prolificId: text("prolific_id").notNull(),
  profession: text("profession").notNull(),
  coldEmailFrequency: text("cold_email_frequency").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  studyId: text("study_id"),
  prolificSessionId: text("prolific_session_id"),
}, (table) => [
  index("idx_prolific_sessions_created_at").on(table.createdAt),
  index("idx_prolific_sessions_prolific_id").on(table.prolificId),
]);

export const emailGenerations = pgTable("email_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  userId: uuid("user_id"),
  source: text("source").default("app").notNull(),
  scenarioName: text("scenario_name"),
  inputJson: jsonb("input_json").notNull(),
  promptVersion: text("prompt_version").notNull(),
  modelName: text("model_name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  wordCount: integer("word_count"),
  hasEmDash: boolean("has_em_dash"),
  clicheCount: integer("cliche_count"),
  validatorPassed: boolean("validator_passed"),
  validatorErrors: jsonb("validator_errors"),
  latencyMs: integer("latency_ms"),
  sessionId: uuid("session_id").references(() => prolificSessions.id, { onDelete: "set null" }),
  exaQueries: jsonb("exa_queries"),
  exaResults: jsonb("exa_results"),
  selectedSources: jsonb("selected_sources"),
  researchedFacts: jsonb("researched_facts"),
  enforcementResults: jsonb("enforcement_results"),
  likeYouCount: integer("like_you_count"),
  researchModelName: text("research_model_name"),
}, (table) => [
  index("idx_email_generations_created_at").on(table.createdAt),
  index("idx_email_generations_session_id").on(table.sessionId),
]);

export const prolificPostSurvey = pgTable("prolific_post_survey", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => prolificSessions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  comparisonRating: integer("comparison_rating"),
  likelihoodChange: text("likelihood_change"),
  likelihoodReasons: jsonb("likelihood_reasons"),
  changesBeforeSending: jsonb("changes_before_sending"),
  whatFeltOff: text("what_felt_off"),
  mostUsefulPart: text("most_useful_part"),
  whatsMissing: text("whats_missing"),
});

export const prolificStepTracking = pgTable("prolific_step_tracking", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => prolificSessions.id),
  prolificId: text("prolific_id").notNull(),
  stepName: text("step_name").notNull(),
  stepNumber: integer("step_number").notNull(),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_step_tracking_prolific").on(table.prolificId),
  index("idx_step_tracking_session").on(table.sessionId),
  index("idx_step_tracking_step").on(table.stepName, table.eventType),
]);

export const insertProlificSessionSchema = createInsertSchema(prolificSessions).omit({
  id: true,
  createdAt: true,
});

export const insertEmailGenerationSchema = createInsertSchema(emailGenerations).omit({
  id: true,
  createdAt: true,
});

export const insertProlificPostSurveySchema = createInsertSchema(prolificPostSurvey).omit({
  id: true,
  createdAt: true,
});

export const insertProlificStepTrackingSchema = createInsertSchema(prolificStepTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertProlificSession = z.infer<typeof insertProlificSessionSchema>;
export type ProlificSession = typeof prolificSessions.$inferSelect;

export type InsertEmailGeneration = z.infer<typeof insertEmailGenerationSchema>;
export type EmailGeneration = typeof emailGenerations.$inferSelect;

export type InsertProlificPostSurvey = z.infer<typeof insertProlificPostSurveySchema>;
export type ProlificPostSurvey = typeof prolificPostSurvey.$inferSelect;

export type InsertProlificStepTracking = z.infer<typeof insertProlificStepTrackingSchema>;
export type ProlificStepTracking = typeof prolificStepTracking.$inferSelect;
