import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import SearchCacheProvider from "./context/SearchCacheProvider";
import LanguageProvider, { getInitialLanguage } from "./context/LanguageProvider";
import CurrencyProvider from "./context/CurrencyProvider";
import { ConfirmProvider } from "./context/ConfirmContext";
import { loadTranslation } from "./context/translations";
import "./utils/validationTooltip";

async function bootstrap() {
  // Resolve the dictionary before the first paint so the app never flashes the
  // default language. The boot loader from index.html stays on screen while the
  // (small) language chunk is fetched; for the bundled default language this
  // resolves without any extra request.
  const initialLanguage = getInitialLanguage();
  const initialDict = await loadTranslation(initialLanguage);

  createRoot(document.getElementById("root")).render(
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider initialLanguage={initialLanguage} initialDict={initialDict}>
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
}

bootstrap();
