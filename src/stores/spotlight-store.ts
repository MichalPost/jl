import { create } from "zustand"

interface SpotlightStore {
  isVisible: boolean
  setVisible: (visible: boolean) => void
}

export const useSpotlightStore = create<SpotlightStore>((set) => ({
  isVisible: false,
  setVisible: (isVisible) => set({ isVisible }),
}))
