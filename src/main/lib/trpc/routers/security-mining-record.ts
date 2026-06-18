import { eq } from "drizzle-orm"
import { app } from "electron"
import { constants } from "node:fs"
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { z } from "zod"
import { chats, getDatabase, projects, subChats } from "../../db"
import {
  createSecurityMiningRecordTemplate,
  isPathInside,
  resolveSecurityMiningRecordLocation,
  type SecurityMiningRecordLocation,
} from "../../security-mining-record/path"
import { createSecurityMiningMarkdownReport } from "../../security-mining-record/report"
import { publicProcedure, router } from "../index"

type LocationWithCreated = SecurityMiningRecordLocation & {
  created: boolean
}

type ReportGenerationResult = SecurityMiningRecordLocation & {
  byteLength: number
  generatedAt: string
}

async function getExistingDirectory(path: string | null | undefined): Promise<string | null> {
  const trimmedPath = path?.trim()
  if (!trimmedPath) return null

  try {
    const pathStat = await stat(trimmedPath)
    return pathStat.isDirectory() ? trimmedPath : null
  } catch {
    return null
  }
}

async function getLocationForChat(input: {
  chatId: string
  subChatId: string
}): Promise<SecurityMiningRecordLocation> {
  const db = getDatabase()
  const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()

  if (!chat) {
    throw new Error(`Chat not found: ${input.chatId}`)
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get()

  const worktreePath = await getExistingDirectory(chat.worktreePath)
  const projectPath = await getExistingDirectory(project?.path)

  return resolveSecurityMiningRecordLocation({
    chatId: input.chatId,
    subChatId: input.subChatId,
    worktreePath,
    projectPath,
    userDataPath: app.getPath("userData"),
  })
}

async function ensureLocationFile(
  location: SecurityMiningRecordLocation,
): Promise<{ created: boolean }> {
  if (!isPathInside(location.filePath, location.projectPath)) {
    throw new Error("Resolved security mining record path escapes its project path")
  }

  await mkdir(location.projectPath, { recursive: true })

  try {
    await access(location.filePath, constants.F_OK)
    return { created: false }
  } catch {
    await writeFile(location.filePath, createSecurityMiningRecordTemplate(), "utf-8")
    return { created: true }
  }
}

async function readTextFileIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return ""
  }
}

function parseMessages(value: string): any[] {
  try {
    const parsed = JSON.parse(value || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const securityMiningRecordInput = z.object({
  chatId: z.string(),
  subChatId: z.string(),
})

export const securityMiningRecordRouter = router({
  location: publicProcedure
    .input(securityMiningRecordInput)
    .query(async ({ input }) => {
      return getLocationForChat(input)
    }),

  ensure: publicProcedure
    .input(securityMiningRecordInput)
    .mutation(async ({ input }) => {
      const location = await getLocationForChat(input)
      const { created } = await ensureLocationFile(location)
      return { ...location, created } satisfies LocationWithCreated
    }),

  generateReport: publicProcedure
    .input(securityMiningRecordInput)
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()
      const project = chat
        ? db.select().from(projects).where(eq(projects.id, chat.projectId)).get()
        : null

      if (!chat) {
        throw new Error(`Chat not found: ${input.chatId}`)
      }
      if (!subChat || subChat.chatId !== input.chatId) {
        throw new Error(`Sub-chat not found: ${input.subChatId}`)
      }

      const location = await getLocationForChat(input)
      await ensureLocationFile(location)

      if (!isPathInside(location.reportPath, location.projectPath)) {
        throw new Error("Resolved security mining report path escapes its project path")
      }

      const generatedAt = new Date()
      const recordContent = await readTextFileIfExists(location.filePath)
      const reportContent = createSecurityMiningMarkdownReport({
        chatName: subChat.name || chat.name,
        projectPath: project?.path || location.projectPath,
        recordPath: location.filePath,
        reportPath: location.reportPath,
        generatedAt,
        recordContent,
        messages: parseMessages(subChat.messages),
      })

      await mkdir(location.projectPath, { recursive: true })
      await writeFile(location.reportPath, reportContent, "utf-8")

      return {
        ...location,
        byteLength: Buffer.byteLength(reportContent, "utf-8"),
        generatedAt: generatedAt.toISOString(),
      } satisfies ReportGenerationResult
    }),
})
