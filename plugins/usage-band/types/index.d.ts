export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageReading = { windows: UsageWindow[]; readAt: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { reading: UsageReading | null }
  }
}
