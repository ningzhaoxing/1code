const EXTERNAL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/

function stripHashAndQuery(href: string): string {
  return href.split("#", 1)[0]!.split("?", 1)[0]!
}

function stripTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, "")
}

function stripMarkdownLineSuffix(path: string): string {
  return path.replace(/(\.md):\d+$/i, "$1")
}

function cleanMarkdownPath(path: string): string {
  return stripMarkdownLineSuffix(stripTrailingSlashes(stripHashAndQuery(path)))
}

function isMarkdownPath(path: string): boolean {
  return cleanMarkdownPath(path).toLowerCase().endsWith(".md")
}

function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

function getPathFromLocalAppUrl(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "::1"
    ) {
      return null
    }

    const decodedPath = decodePath(cleanMarkdownPath(url.pathname))
    if (!decodedPath || !isMarkdownPath(decodedPath)) return null

    // Vite dev-server file URLs can be serialized as /@fs/Users/... or /@fs/C:/...
    if (decodedPath.startsWith("/@fs/")) {
      const fsPath = decodedPath.slice("/@fs".length)
      return /^\/[a-zA-Z]:\//.test(fsPath) ? fsPath.slice(1) : fsPath
    }

    // Windows absolute paths are serialized as /C:/Users/...
    if (/^\/[a-zA-Z]:\//.test(decodedPath)) return decodedPath.slice(1)

    // If a relative Markdown link is normalized by the browser against the app
    // origin, the pathname becomes /漏洞挖掘记录.md. Keep it relative so the
    // caller can resolve it against the current chat/worktree artifact location.
    if (!isLikelyUnixAbsolutePath(decodedPath)) return decodedPath.replace(/^\/+/, "")

    return decodedPath
  } catch {
    return null
  }
}

function isLikelyUnixAbsolutePath(path: string): boolean {
  return /^\/(?:Users|home|private|tmp|var|opt|Volumes|workspace|mnt)\//.test(path)
}

function addSchemeToLocalhostUrl(href: string): string {
  return /^(?:localhost|127\.0\.0\.1):\d+\//i.test(href) ? `http://${href}` : href
}

export function getLocalMarkdownFilePathFromHref(href: string | undefined): string | null {
  const trimmed = href?.trim()
  if (!trimmed) return null

  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) {
    const path = cleanMarkdownPath(trimmed)
    return isMarkdownPath(path) ? path : null
  }

  if (trimmed.startsWith("file://")) {
    try {
      const path = cleanMarkdownPath(decodeURIComponent(new URL(trimmed).pathname))
      return isMarkdownPath(path) ? path : null
    } catch {
      return null
    }
  }

  const localAppUrlPath = getPathFromLocalAppUrl(addSchemeToLocalhostUrl(trimmed))
  if (localAppUrlPath) return localAppUrlPath

  if (EXTERNAL_SCHEME_PATTERN.test(trimmed)) {
    return null
  }

  const path = cleanMarkdownPath(trimmed)
  if (!isMarkdownPath(path)) return null
  return decodePath(path)
}

function isLikelyMarkdownFilenameHost(href: string | undefined): boolean {
  const trimmed = href?.trim()
  if (!trimmed) return false

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    const path = url.pathname.replace(/\/+$/, "")
    return path === "" && url.hostname.toLowerCase().endsWith(".md")
  } catch {
    return false
  }
}

export function getLocalMarkdownFilePathFromLink({
  href,
  text,
}: {
  href: string | undefined
  text: string | undefined
}): string | null {
  const pathFromHref = getLocalMarkdownFilePathFromHref(href)
  if (pathFromHref) return pathFromHref

  if (!isLikelyMarkdownFilenameHost(href)) return null
  return getLocalMarkdownFilePathFromHref(text)
}
