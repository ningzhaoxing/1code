import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildExtendedPath, isWindows } from "./platform";

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  };
}

interface ClaudeConfig {
  primaryApiKey?: string;
}

export interface ClaudeOAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

const CLAUDE_CODE_HOST_AUTH_ENV_KEYS = [
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_SCOPES',
  'CLAUDE_CODE_SUBSCRIPTION_TYPE',
  'CLAUDE_CODE_RATE_LIMIT_TIER',
  'CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH',
  'CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH',
  'ANTHROPIC_BASE_URL',
];

/**
 * Read Claude OAuth credentials from system credential store
 * Dispatches to platform-specific implementation
 */
function readFromKeychain(): ClaudeOAuthCredential | null {
  if (process.platform === 'darwin') {
    return readFromMacOSKeychain();
  } else if (process.platform === 'win32') {
    return readFromWindowsCredentialManager();
  } else if (process.platform === 'linux') {
    return readFromLinuxSecretService();
  }
  return null;
}

/**
 * Read Claude OAuth credentials from macOS Keychain
 */
function readFromMacOSKeychain(): ClaudeOAuthCredential | null {
  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // Keychain entry not found or parse error
  }
  return null;
}

/**
 * Read Claude OAuth credentials from Windows Credential Manager
 * Falls back to credentials file which Claude Code uses on Windows
 */
function readFromWindowsCredentialManager(): ClaudeOAuthCredential | null {
  try {
    // Read from the credentials file location that Claude Code uses on Windows
    const credentialsPath = join(homedir(), '.claude', '.credentials.json');
    if (existsSync(credentialsPath)) {
      const content = readFileSync(credentialsPath, 'utf-8');
      const credentials: ClaudeCredentials = JSON.parse(content);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // Credential Manager read failed
  }
  return null;
}

/**
 * Read Claude OAuth credentials from Linux Secret Service (libsecret)
 * Uses secret-tool CLI which interfaces with GNOME Keyring or KDE Wallet
 */
function readFromLinuxSecretService(): ClaudeOAuthCredential | null {
  try {
    // Try secret-tool (works with GNOME Keyring, KDE Wallet via libsecret)
    const result = execSync(
      'secret-tool lookup service "Claude Code" account "credentials" 2>/dev/null',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // secret-tool not available or entry not found
  }

  // Fallback: try pass (password-store)
  try {
    const result = execSync(
      'pass show claude-code/credentials 2>/dev/null',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // pass not available or entry not found
  }

  return null;
}

/**
 * Read Claude OAuth credentials from credentials file (Linux/fallback)
 */
function readFromCredentialsFile(): ClaudeOAuthCredential | null {
  const credentialsPath = join(homedir(), '.claude', '.credentials.json');

  try {
    if (existsSync(credentialsPath)) {
      const content = readFileSync(credentialsPath, 'utf-8');
      const credentials: ClaudeCredentials = JSON.parse(content);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // File not found or parse error
  }
  return null;
}

/**
 * Claude Code 2.x can store local auth in ~/.claude.json.
 * Keep this as a boolean check so we do not expose or copy the API key.
 */
export function hasExistingClaudeConfigAuth(): boolean {
  const configPath = join(homedir(), '.claude.json');

  try {
    if (!existsSync(configPath)) {
      return false;
    }

    const content = readFileSync(configPath, 'utf-8');
    const config: ClaudeConfig = JSON.parse(content);
    return !!config.primaryApiKey?.trim();
  } catch {
    return false;
  }
}

/**
 * Claude Desktop can launch local Claude Code with host-managed auth in env.
 * Reuse only the required auth env keys and never log or persist their values.
 */
export function getRunningClaudeCodeHostAuthEnv(): Record<string, string> | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const output = execSync('ps eww -axo command=', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });

    const candidates = output
      .split('\n')
      .filter((line) => line.includes('CLAUDE_CODE_OAUTH_TOKEN='));

    if (candidates.length === 0) {
      return null;
    }

    const line =
      candidates.find((candidate) =>
        candidate.includes('/Applications/Claude.app') ||
        candidate.includes('/Library/Application Support/Claude/claude-code'),
      ) || candidates[0];

    const env: Record<string, string> = {};
    for (const key of CLAUDE_CODE_HOST_AUTH_ENV_KEYS) {
      const match = line.match(new RegExp(`${key}=([^\\s]+)`));
      if (match?.[1]) {
        env[key] = match[1];
      }
    }

    return env.CLAUDE_CODE_OAUTH_TOKEN ? env : null;
  } catch {
    return null;
  }
}

export function hasRunningClaudeCodeHostAuth(): boolean {
  return !!getRunningClaudeCodeHostAuthEnv()?.CLAUDE_CODE_OAUTH_TOKEN;
}

/**
 * Get existing Claude OAuth credentials from keychain or credentials file
 */
export function getExistingClaudeCredentials(): ClaudeOAuthCredential | null {
  // Try keychain first (macOS, Windows, Linux)
  const keychainCreds = readFromKeychain();
  if (keychainCreds) {
    return keychainCreds;
  }

  // Fall back to credentials file
  return readFromCredentialsFile();
}

/**
 * Get existing Claude OAuth token from keychain or credentials file
 * @deprecated Use getExistingClaudeCredentials() to get full credentials with refresh token
 */
export function getExistingClaudeToken(): string | null {
  const creds = getExistingClaudeCredentials();
  return creds?.accessToken || null;
}

/**
 * Refresh Claude OAuth token using refresh token
 * Uses the Anthropic API token endpoint
 */
export async function refreshClaudeToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'claude-desktop',
  });

  const response = await fetch('https://api.anthropic.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Claude token: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/**
 * Check if a token is expired or will expire soon (within 5 minutes)
 */
export function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) {
    // If no expiry, assume token is still valid
    return false;
  }
  // Consider expired if less than 5 minutes remaining
  const bufferMs = 5 * 60 * 1000;
  return Date.now() + bufferMs >= expiresAt;
}

/**
 * Build extended PATH with common installation locations
 * This is necessary because when running from Finder/Dock (macOS) or
 * Start Menu (Windows), the PATH may not include directories where
 * claude CLI is installed
 *
 * Delegates to platform provider for cross-platform support.
 */
function getExtendedPath(): string {
  return buildExtendedPath(process.env.PATH);
}

/**
 * Check if Claude CLI is installed (cross-platform)
 * Uses extended PATH to find claude even when running from Finder/Dock
 */
export function isClaudeCliInstalled(): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const command = isWindows() ? 'where claude' : 'which claude';
    const fullPath = getExtendedPath();

    execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `claude setup-token` to authenticate with Claude
 * Returns a promise that resolves when the process completes
 *
 * Note: Uses pipe for stdio instead of inherit to prevent hanging in non-TTY
 * environments (like Electron apps launched from Finder/Dock)
 */
export function runClaudeSetupToken(
  onStatus: (message: string) => void
): Promise<{ success: boolean; token?: string; error?: string }> {
  return new Promise((resolve) => {
    onStatus('Starting Claude setup-token...');

    const fullPath = getExtendedPath();

    const child = spawn('claude', ['setup-token'], {
      // Don't use 'inherit' - it causes hang in non-TTY environments
      // Use 'ignore' for stdin and 'pipe' for stdout/stderr
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, PATH: fullPath },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      onStatus(text.trim());
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Timeout after 2 minutes to prevent indefinite hang
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        error: 'Authentication timed out after 2 minutes. Please try again.',
      });
    }, 120000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: `Failed to start claude setup-token: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Wait a moment for the token to be written to keychain
        setTimeout(() => {
          const token = getExistingClaudeToken();
          if (token) {
            resolve({ success: true, token });
          } else {
            resolve({
              success: false,
              error: 'Token not found after setup. The authentication may have failed.',
            });
          }
        }, 500);
      } else {
        const errorDetail = stderr.trim() || `Process exited with code ${code}`;
        resolve({
          success: false,
          error: errorDetail,
        });
      }
    });
  });
}
