import { create } from "zustand"
import type { AppSettings } from "@/types"

interface ThemeStore {
  settings: AppSettings | null
  setSettings: (settings: AppSettings) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}))
