import { z } from "zod"
import { GLOBAL_MCP_PATH } from "../../claude-config"
import {
  projectProviderMcpRecord,
  projectProviderSkillRecord,
} from "../../tooling/catalog-projection"
import { parseToolingItemId } from "../../tooling/ids"
import { toolingCatalog } from "../../tooling/catalog"
import { ToolingError } from "../../tooling/errors"
import { toolingStore } from "../../tooling/store"
import { publicProcedure, router } from "../index"

const toolingProviderSchema = z.enum(["claude", "codex"])
const toolingProviderFilterSchema = z.enum(["claude", "codex", "all"])
const toolingKindFilterSchema = z.enum(["skill", "mcp", "all"])
const toolingSourceSchema = z.enum(["user", "project"])
const mcpScopeSchema = z.enum(["global", "project"])
const mcpTransportSchema = z.enum(["stdio", "http"])
const mcpAuthTypeSchema = z.enum(["none", "oauth", "bearer"])

export const toolingRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          provider: toolingProviderFilterSchema.optional(),
          kind: toolingKindFilterSchema.optional(),
          projectPath: z.string().optional().nullable(),
          includeContent: z.boolean().optional(),
          includeStatus: z.boolean().optional(),
          includeDisabled: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => toolingCatalog.list(input ?? {})),

  get: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        projectPath: z.string().optional().nullable(),
        includeContent: z.boolean().optional(),
        includeStatus: z.boolean().optional(),
      }),
    )
    .query(({ input }) =>
      toolingCatalog.get(input.itemId, {
        projectPath: input.projectPath,
        includeContent: input.includeContent,
        includeStatus: input.includeStatus,
      }),
    ),

  refreshStatus: publicProcedure
    .input(
      z
        .object({
          provider: toolingProviderFilterSchema.optional(),
          kind: toolingKindFilterSchema.optional(),
          projectPath: z.string().optional().nullable(),
          includeDisabled: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      toolingCatalog.list({
        ...(input ?? {}),
        includeStatus: true,
      }),
    ),

  createSkill: publicProcedure
    .input(
      z.object({
        provider: toolingProviderSchema.optional(),
        source: toolingSourceSchema,
        projectPath: z.string().optional().nullable(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async ({ input }) =>
      projectProviderSkillRecord(await toolingStore.createSkill(input)),
    ),

  updateSkill: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
      }),
    )
    .mutation(({ input }) =>
      toolingStore.updateSkill(input.itemId, {
        name: input.name,
        description: input.description,
        content: input.content,
      }),
    ),

  deleteSkill: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(({ input }) => toolingStore.deleteSkill(input.itemId)),

  createMcpServer: publicProcedure
    .input(
      z.object({
        provider: toolingProviderSchema.optional(),
        scope: mcpScopeSchema,
        projectPath: z.string().optional().nullable(),
        name: z.string(),
        transport: mcpTransportSchema,
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().optional(),
        authType: mcpAuthTypeSchema.optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) =>
      projectProviderMcpRecord(await toolingStore.createMcpServer(input)),
    ),

  createMcp: publicProcedure
    .input(
      z.object({
        provider: toolingProviderSchema.optional(),
        scope: mcpScopeSchema,
        projectPath: z.string().optional().nullable(),
        name: z.string(),
        transport: mcpTransportSchema,
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().optional(),
        authType: mcpAuthTypeSchema.optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) =>
      projectProviderMcpRecord(await toolingStore.createMcpServer(input)),
    ),

  updateMcpServer: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        newName: z.string().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().optional(),
        authType: mcpAuthTypeSchema.optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { itemId, ...patch } = input
      return toolingStore.updateMcpServer(itemId, patch)
    }),

  updateMcp: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        newName: z.string().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().optional(),
        authType: mcpAuthTypeSchema.optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { itemId, ...patch } = input
      return toolingStore.updateMcpServer(itemId, patch)
    }),

  deleteMcpServer: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(({ input }) => toolingStore.deleteMcpServer(input.itemId)),

  deleteMcp: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(({ input }) => toolingStore.deleteMcpServer(input.itemId)),

  setEnabled: publicProcedure
    .input(z.object({ itemId: z.string(), enabled: z.boolean() }))
    .mutation(({ input }) => toolingStore.setEnabled(input.itemId, input.enabled)),

  setMcpEnabled: publicProcedure
    .input(z.object({ itemId: z.string(), enabled: z.boolean() }))
    .mutation(({ input }) => toolingStore.setMcpEnabled(input.itemId, input.enabled)),

  startMcpAuth: publicProcedure
    .input(z.object({ itemId: z.string(), projectPath: z.string().optional().nullable() }))
    .mutation(async ({ input }) => {
      const parsed = parseToolingItemId(input.itemId)
      if (!parsed) {
        throw new ToolingError("INVALID_PATH", "Invalid tooling item id")
      }
      if (parsed.kind !== "mcp") {
        throw new ToolingError("UNSUPPORTED_OPERATION", "Only MCP items support auth")
      }

      const item = await toolingCatalog.get(input.itemId, {
        projectPath: input.projectPath,
        includeStatus: true,
      })
      if (item.kind !== "mcp") {
        throw new ToolingError("UNSUPPORTED_OPERATION", "Only MCP items support auth")
      }

      const { startMcpOAuth } = await import("../../mcp-auth")
      return startMcpOAuth(
        item.mcp.nativeName,
        item.projectPath ?? input.projectPath ?? GLOBAL_MCP_PATH,
      )
    }),
})
