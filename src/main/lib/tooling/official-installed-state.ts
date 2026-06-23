import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export type OfficialInstalledStateEntry = {
  itemId: string
  kind: "skill" | "mcp"
  provider: "claude" | "codex"
  source: "official"
  name: string
  targetPath: string
  fingerprint: string
  version?: string
  installedAt: string
  updatedAt: string
}

export type OfficialInstalledStateDocument = {
  version: number
  items?: Record<string, OfficialInstalledStateEntry>
}

function getDefaultInstalledStatePath(): string {
  const homeDir = process.env.HOME?.trim() || os.homedir()
  return path.join(homeDir, ".1code", "tooling", "official-installed-state.json")
}

export class OfficialInstalledStateStore {
  constructor(private readonly filePath: string = getDefaultInstalledStatePath()) {}

  get path(): string {
    return this.filePath
  }

  async read(): Promise<OfficialInstalledStateDocument> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf-8"))
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        items: parsed.items || {},
      }
    } catch {
      return { version: 1, items: {} }
    }
  }

  async get(itemId: string): Promise<OfficialInstalledStateEntry | undefined> {
    return (await this.read()).items?.[itemId]
  }

  async set(itemId: string, entry: OfficialInstalledStateEntry): Promise<void> {
    const doc = await this.read()
    const items = doc.items || {}
    const previous = items[itemId]
    const now = new Date().toISOString()

    items[itemId] = {
      ...entry,
      itemId,
      installedAt: previous?.installedAt || entry.installedAt || now,
      updatedAt: now,
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: doc.version || 1, items }, null, 2),
      "utf-8",
    )
  }

  async remove(itemId: string): Promise<void> {
    const doc = await this.read()
    const items = doc.items || {}
    delete items[itemId]
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: doc.version || 1, items }, null, 2),
      "utf-8",
    )
  }
}

export const officialInstalledStateStore = new OfficialInstalledStateStore()
