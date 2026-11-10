import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import SearchCacheProvider from "./context/SearchCacheProvider";
import LanguageProvider from "./context/LanguageProvider";
import CurrencyProvider from "./context/CurrencyProvider";
import { ConfirmProvider } from "./context/ConfirmContext";
import "./utils/validationTooltip";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <LanguageProvider>
        <CurrencyProvider>
          <SearchCacheProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </SearchCacheProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </AuthProvider>
  </BrowserRouter>,
);
