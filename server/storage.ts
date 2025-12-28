import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  prolificSessions,
  emailGenerations,
  prolificPostSurvey,
  prolificStepTracking,
  type InsertProlificSession,
  type ProlificSession,
  type InsertEmailGeneration,
  type EmailGeneration,
  type InsertProlificPostSurvey,
  type ProlificPostSurvey,
  type InsertProlificStepTracking,
  type ProlificStepTracking,
} from "../shared/schema";

export interface IStorage {
  createProlificSession(session: InsertProlificSession): Promise<ProlificSession>;
  getProlificSessionById(id: string): Promise<ProlificSession | undefined>;
  getProlificSessionByProlificId(prolificId: string): Promise<ProlificSession | undefined>;
  updateProlificSessionCompletedAt(id: string, completedAt: Date): Promise<void>;
  
  createEmailGeneration(generation: InsertEmailGeneration): Promise<EmailGeneration>;
  getEmailGenerationsBySessionId(sessionId: string): Promise<EmailGeneration[]>;
  countEmailGenerationsBySessionId(sessionId: string): Promise<number>;
  
  createProlificPostSurvey(survey: InsertProlificPostSurvey): Promise<ProlificPostSurvey>;
  
  createProlificStepTracking(tracking: InsertProlificStepTracking): Promise<ProlificStepTracking>;
}

export class DatabaseStorage implements IStorage {
  async createProlificSession(session: InsertProlificSession): Promise<ProlificSession> {
    const [result] = await db.insert(prolificSessions).values(session).returning();
    return result;
  }

  async getProlificSessionById(id: string): Promise<ProlificSession | undefined> {
    const [result] = await db.select().from(prolificSessions).where(eq(prolificSessions.id, id));
    return result;
  }

  async getProlificSessionByProlificId(prolificId: string): Promise<ProlificSession | undefined> {
    const [result] = await db.select().from(prolificSessions).where(eq(prolificSessions.prolificId, prolificId));
    return result;
  }

  async updateProlificSessionCompletedAt(id: string, completedAt: Date): Promise<void> {
    await db.update(prolificSessions).set({ completedAt }).where(eq(prolificSessions.id, id));
  }

  async createEmailGeneration(generation: InsertEmailGeneration): Promise<EmailGeneration> {
    const [result] = await db.insert(emailGenerations).values(generation).returning();
    return result;
  }

  async getEmailGenerationsBySessionId(sessionId: string): Promise<EmailGeneration[]> {
    return db.select().from(emailGenerations).where(eq(emailGenerations.sessionId, sessionId));
  }

  async countEmailGenerationsBySessionId(sessionId: string): Promise<number> {
    const results = await db.select().from(emailGenerations).where(eq(emailGenerations.sessionId, sessionId));
    return results.length;
  }

  async createProlificPostSurvey(survey: InsertProlificPostSurvey): Promise<ProlificPostSurvey> {
    const [result] = await db.insert(prolificPostSurvey).values(survey).returning();
    return result;
  }

  async createProlificStepTracking(tracking: InsertProlificStepTracking): Promise<ProlificStepTracking> {
    const [result] = await db.insert(prolificStepTracking).values(tracking).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
