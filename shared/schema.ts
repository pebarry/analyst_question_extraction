import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  quarter: text("quarter").notNull(),
  year: integer("year").notNull(),
  title: text("title").notNull(),
  date: text("date").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull(),
  revenue: text("revenue"),
  growth: text("growth"),
  eps: text("eps"),
  margin: text("margin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTranscriptSchema = createInsertSchema(transcripts).omit({
  id: true,
  createdAt: true,
});

export const fetchTranscriptsSchema = z.object({
  symbol: z.string().min(1).max(5).toUpperCase(),
  quarters: z.array(z.enum(["Q1", "Q2", "Q3", "Q4"])).min(1),
  years: z.array(z.number().int().min(2000).max(new Date().getFullYear())).min(1),
});

export const downloadAnalystQuestionsSchema = z.object({
  transcriptIds: z.array(z.number()).min(1),
  format: z.enum(["pdf", "docx", "txt", "xlsx", "csv"]),
});

export const downloadPreparedStatementsSchema = z.object({
  transcriptIds: z.array(z.number()).min(1),
  format: z.enum(["pdf", "docx", "txt", "xlsx", "csv"]),
});

export const generateSummarySchema = z.object({
  transcriptIds: z.array(z.number()).min(1),
  customPrompt: z.string().optional(),
  financialContext: z.record(z.any()).optional()
});

// Analyst question structure
export interface AnalystQuestion {
  analystName: string;
  analystTitle: string;
  analystCompany: string;
  question: string;
  transcriptId: number;
  symbol: string;
  quarter: string;
  year: number;
  transcriptTitle: string;
}

// Prepared statement structure
export interface PreparedStatement {
  speakerName: string;
  speakerTitle: string;
  statement: string;
  transcriptId: number;
  symbol: string;
  quarter: string;
  year: number;
  transcriptTitle: string;
}

// Summary structure
export interface TranscriptSummary {
  id: string;
  transcriptIds: number[];
  symbols: string[];
  quarters: string[];
  years: number[];
  summary: string;
  keyInsights: string[];
  analystQuestionCount: number;
  generatedAt: string;
}

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Transcript = typeof transcripts.$inferSelect;
export type FetchTranscriptsRequest = z.infer<typeof fetchTranscriptsSchema>;
export type DownloadAnalystQuestionsRequest = z.infer<typeof downloadAnalystQuestionsSchema>;
export type DownloadPreparedStatementsRequest = z.infer<typeof downloadPreparedStatementsSchema>;
export type GenerateSummaryRequest = z.infer<typeof generateSummarySchema>;
