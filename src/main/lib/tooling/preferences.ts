import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

export type OfficialPreferenceEntry = {
  enabled: boolean
  updatedAt: string
}

export type OfficialPreferencesDocument = {
  items?: Record<string, OfficialPreferenceEntry>
}

function getDefaultPreferencesPath(): string {
  const homeDir = process.env.HOME?.trim() || os.homedir()
  return path.join(homeDir, ".1code", "tooling", "official-preferences.json")
}

export class OfficialPreferencesStore {
  constructor(private readonly filePath: string = getDefaultPreferencesPath()) {}

  get path(): string {
    return this.filePath
  }

  async read(): Promise<OfficialPreferencesDocument> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf-8"))
    } catch {
      return { items: {} }
    }
  }

  async getEnabled(itemId: string, defaultEnabled: boolean): Promise<boolean> {
    const doc = await this.read()
    const entry = doc.items?.[itemId]
    return entry ? entry.enabled : defaultEnabled
  }

  async setEnabled(itemId: string, enabled: boolean): Promise<void> {
    const doc = await this.read()
    const items = doc.items || {}
    items[itemId] = {
      enabled,
      updatedAt: new Date().toISOString(),
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ ...doc, items }, null, 2),
      "utf-8",
    )
  }
}

export const officialPreferencesStore = new OfficialPreferencesStore()
