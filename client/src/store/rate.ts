import { create } from "zustand";

interface RateState {
  rate: string;
  updatedAt: string | null;
  setRate: (rate: string, updatedAt: string) => void;
}

export const useRateStore = create<RateState>()((set) => ({
  rate: "0",
  updatedAt: null,
  setRate: (rate, updatedAt) => set({ rate, updatedAt }),
}));
