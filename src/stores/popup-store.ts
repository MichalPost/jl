import { create } from "zustand"
import type { TextSelectedPayload } from "@/types"

interface PopupStore {
  isVisible: boolean
  selection: TextSelectedPayload | null
  lastSelection: TextSelectedPayload | null
  selectionCapturedAt?: number
  errorMessage?: string
  setSelection: (selection: TextSelectedPayload | null) => void
  hide: () => void
  setError: (message?: string) => void
}

export const usePopupStore = create<PopupStore>((set) => ({
  isVisible: false,
  selection: null,
  lastSelection: null,
  selectionCapturedAt: undefined,
  errorMessage: undefined,
  setSelection: (selection) =>
    set({
      selection,
      lastSelection: selection ?? null,
      selectionCapturedAt: selection ? Date.now() : undefined,
      isVisible: Boolean(selection),
      errorMessage: undefined,
    }),
  hide: () =>
    set({ isVisible: false, selection: null, errorMessage: undefined }),
  setError: (message) => set({ errorMessage: message }),
}))
