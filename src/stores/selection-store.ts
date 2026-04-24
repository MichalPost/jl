import { create } from "zustand"

interface SelectionStore {
  selectedItemId?: string
  setSelectedItemId: (id?: string) => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedItemId: undefined,
  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
}))
