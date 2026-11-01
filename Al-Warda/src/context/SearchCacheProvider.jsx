import { useRef } from "react";
import { SearchCacheContext } from "./searchCache";

const keyOf = (query) => query.trim().toLowerCase();

export default function SearchCacheProvider({ children }) {
  const cache = useRef(new Map());

  const value = {
    get: (query) => cache.current.get(keyOf(query)),
    set: (query, books) => cache.current.set(keyOf(query), books),
  };

  return (
    <SearchCacheContext.Provider value={value}>
      {children}
    </SearchCacheContext.Provider>
  );
}
