/// <reference types="vite/client" />

// Extend Vite's ImportMetaEnv with our custom env vars
declare global {
  interface ImportMetaEnv {
    // Main process (MAIN_VITE_ prefix)
    readonly MAIN_VITE_SENTRY_DSN?: string
    readonly MAIN_VITE_POSTHOG_KEY?: string
    readonly MAIN_VITE_POSTHOG_HOST?: string
    readonly MAIN_VITE_ENABLE_BUILT_IN_AUTH?: string
    readonly MAIN_VITE_BYPASS_AUTH?: string
    readonly MAIN_VITE_DEV_USER_DATA_PATH?: string
    readonly MAIN_VITE_DISABLE_DEVTOOLS?: string

    // Renderer process (VITE_ prefix)
    readonly VITE_POSTHOG_KEY?: string
    readonly VITE_POSTHOG_HOST?: string
    readonly VITE_BYPASS_PROVIDER_ONBOARDING?: string
    readonly VITE_DEFAULT_PROVIDER?: "claude-code" | "codex"
    readonly VITE_DEFAULT_PROJECT_PATH?: string
  }
}

export {}
