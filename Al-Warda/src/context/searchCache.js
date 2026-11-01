import { createContext, useContext } from "react";

export const SearchCacheContext = createContext(null);

export function useSearchCache() {
  const context = useContext(SearchCacheContext);
  if (!context) {
    throw new Error("useSearchCache must be used inside SearchCacheProvider");
  }
  return context;
}
