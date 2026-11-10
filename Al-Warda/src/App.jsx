import { lazy, Suspense, useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import Footer from "./components/footer/Footer";
import Header from "./components/header/Header";
import Home from "./components/home/Home";
import SmallAnnouncements from "./components/announcements/SmallAnnouncements";
import { isLoggedIn } from "../utils/auth";
import { useAuth } from "./context/AuthContext";
import { getCookie, setCookie } from "../utils/cookies";
import { getPerfumes } from "../utils/perfumes";
import { fetchActiveAnnouncements } from "../utils/announcements";

// Warm perfumes catalog when idle so initial React mount and paint are instantaneous
if (typeof window !== "undefined") {
  const warmCatalog = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => {
        getPerfumes().catch(() => {});
      }, { timeout: 3500 });
    } else {
      setTimeout(() => {
        getPerfumes().catch(() => {});
      }, 1000);
    }
  };
  if (document.readyState === "complete") {
    warmCatalog();
  } else {
    window.addEventListener("load", warmCatalog, { once: true });
  }
}

const loadFeatured = () => import("./components/featured/Featured");
const loadSets = () => import("./components/sets/Sets");
const loadAbout = () => import("./components/about/About");
const loadDiscount = () => import("./components/discount/Discount");
const loadNewBooks = () => import("./components/newbooks/NewBooks");
const loadTestimonial = () => import("./components/testimonial/Testimonial");
const loadContacts = () => import("./components/contacts/Contacts");
const loadCart = () => import("./components/cart/Cart");
const loadCheckout = () => import("./components/checkout/Checkout");
const loadSearchResults = () => import("./components/searchresults/SearchResults");
const loadBookDetails = () => import("./components/bookdetails/BookDetails");
const loadProfile = () => import("./components/profile/Profile");
const loadOrders = () => import("./components/orders/Orders");
const loadPrivileged = () => import("./components/privileged/Privileged");
const loadLogin = () => import("./components/login/Login");
const loadSignUp = () => import("./components/signup/SignUp");
const loadJoin = () => import("./components/join/Join");
const loadNotFound = () => import("./components/notfound/NotFound");
const loadWardaAssistant = () => import("./components/warda/WardaAssistant");
const loadSearch = () => import("./components/search/Search");

const Featured = lazy(loadFeatured);
const Sets = lazy(loadSets);
const About = lazy(loadAbout);
const Discount = lazy(loadDiscount);
const NewBooks = lazy(loadNewBooks);
const Testimonial = lazy(loadTestimonial);
const Contacts = lazy(loadContacts);
const Cart = lazy(loadCart);
const Checkout = lazy(loadCheckout);
const SearchResults = lazy(loadSearchResults);
const BookDetails = lazy(loadBookDetails);
const Profile = lazy(loadProfile);
const Orders = lazy(loadOrders);
const Privileged = lazy(loadPrivileged);
const Login = lazy(loadLogin);
const SignUp = lazy(loadSignUp);
const Join = lazy(loadJoin);
const NotFound = lazy(loadNotFound);
const WardaAssistant = lazy(loadWardaAssistant);
const Search = lazy(loadSearch);

function DeferredWardaAssistant() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer = null;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    } else {
      timer = setTimeout(() => setReady(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <WardaAssistant />
    </Suspense>
  );
}

const THEME_COOKIE_KEY = "alwarda_theme";

function getInitialTheme() {
  if (typeof document === "undefined") return false;
  try {
    const saved = getCookie(THEME_COOKIE_KEY)  || getCookie("theme");
    if (saved === "light") return true;
    if (saved === "dark") return false;
  } catch {
    // Ignore error
  }
  // Default: dark luxury theme for Al-Warda
  return false;
}

function GuestOnly({ children }) {
  const { isLoggedIn, loading } = useAuth();
  if (loading) {
    return (
      <div className="app-route-loader" role="status" aria-live="polite">
        <div className="app-route-loader__spinner" />
      </div>
    );
  }
  return isLoggedIn ? <Navigate to="/" replace /> : children;
}

function PrivateRoute({ children, redirectTo, privilegedOnly = false }) {
  const location = useLocation();
  const { isLoggedIn, isPrivileged, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-route-loader" role="status" aria-live="polite">
        <div className="app-route-loader__spinner" />
      </div>
    );
  }

  if (!isLoggedIn) {
    const target =
      redirectTo ||
      `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={target} replace />;
  }

  if (privilegedOnly && !isPrivileged) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const [lightTheme, setLightTheme] = useState(getInitialTheme);
  const [showSearch, setShowSearch] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const shouldRestoreScroll = Boolean(
    location.state?.restoreCartScroll ||
    location.state?.restoreDiscountScroll ||
    location.state?.restoreHomeScroll,
  );

  // Continuously record scroll position on browsable listing pages so Back button restores exact scroll position
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const path = window.location.pathname;
          if (!path.startsWith("/perfume")) {
            const currentY = window.scrollY;
            if (currentY > 0) {
              const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
              sessionStorage.setItem(scrollKey, String(currentY));
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchActiveAnnouncements()
      .then((items) => {
        if (!cancelled && Array.isArray(items)) {
          setAnnouncements(items);
        }
      })
      .catch((err) => console.warn("Failed to load active announcements:", err));

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    // Defer background prefetching until after initial page render is complete
    // so it never competes with homepage critical resources on first load
    const runIdlePrefetch = () => {
      fetch("/api/warmup", { method: "POST" }).catch(() => {});
      loadFeatured();
      loadDiscount();
      loadNewBooks();
      loadBookDetails();
      loadSearchResults();
    };

    const timer = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(runIdlePrefetch, { timeout: 4000 });
      } else {
        runIdlePrefetch();
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // When returning via Back button (POP navigation):
    if (navigationType === "POP") {
      const path = location.pathname || "";
      if (!path.startsWith("/perfume")) {
        const scrollKey = `warda_scroll_${location.pathname}${location.search}`;
        const savedY = Number(sessionStorage.getItem(scrollKey));
        if (Number.isFinite(savedY) && savedY > 0) {
          let attempts = 0;
          const tryRestore = () => {
            const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (scrollableHeight >= savedY || attempts > 25) {
              window.scrollTo({ top: savedY, behavior: "instant" });
            } else {
              attempts++;
              requestAnimationFrame(tryRestore);
            }
          };
          requestAnimationFrame(tryRestore);
          return;
        }
      }
    }

    if (shouldRestoreScroll) return;
    // Do not force scroll-to-top when switching tabs inside /privileged, /priviledged, /admin, or /orders
    const path = location.pathname || "";
    if (
      /^\/(privileged|priviledged|admin|orders)\/[^/]+/i.test(path) &&
      location.state?.preventScrollReset
    ) {
      return;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, navigationType, shouldRestoreScroll, location.state]);

  useEffect(() => {
    document.body.classList.toggle("dark-theme", !lightTheme);
    document.documentElement.classList.toggle("dark-theme", !lightTheme);
    setCookie(THEME_COOKIE_KEY, lightTheme ? "light" : "dark");
  }, [lightTheme]);

  const theme = () => {
    setLightTheme((currentTheme) => !currentTheme);
  };

  const login = () => navigate(`/login${location.search}`);
  const signUp = () => navigate(`/sign-up${location.search}`);
  const closeAuth = () => navigate("/");

  return (
    <>
      <Header
        theme={theme}
        isLight={lightTheme}
        onSearch={() => setShowSearch(true)}
      />
      {showSearch && (
        <Suspense fallback={null}>
          <Search show={showSearch} onClose={() => setShowSearch(false)} />
        </Suspense>
      )}
      {announcements.length > 0 && (
        <div className="container" style={{ paddingTop: "1rem", paddingBottom: "0.25rem" }}>
          <SmallAnnouncements items={announcements} />
        </div>
      )}
      <Suspense
        fallback={
          <div className="app-route-loader" role="status" aria-live="polite">
            <div className="app-route-loader__spinner" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login onSignUp={signUp} onClose={closeAuth} />
              </GuestOnly>
            }
          />
          <Route
            path="/sign-up"
            element={
              <GuestOnly>
                <SignUp onLogin={login} onClose={closeAuth} />
              </GuestOnly>
            }
          />
          <Route path="/join" element={<Join />} />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <PrivateRoute>
                <Orders defaultTab="current" key="orders-current" />
              </PrivateRoute>
            }
          />
          <Route
            path="/orders/:tab"
            element={
              <PrivateRoute>
                <Orders />
              </PrivateRoute>
            }
          />
          <Route
            path="/privileged"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/privileged/:tab"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/priviledged"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/priviledged/:tab"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/:tab"
            element={
              <PrivateRoute privilegedOnly>
                <Privileged />
              </PrivateRoute>
            }
          />
          <Route
            path="/cart"
            element={<Cart onSearch={() => setShowSearch(true)} />}
          />
          <Route
            path="/checkout"
            element={<Checkout />}
          />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/search/:query" element={<SearchResults />} />
          <Route path="/perfume" element={<BookDetails />} />
          <Route path="/perfume/:bookId" element={<BookDetails />} />
          <Route path="/book" element={<BookDetails />} />
          <Route path="/book/:bookId" element={<BookDetails />} />
          <Route path="/shop" element={<Featured />} />
          <Route path="/featured" element={<Featured />} />
          <Route path="/sets" element={<Sets />} />
          <Route path="/try-and-discover" element={<Sets />} />
          <Route path="/discovery" element={<Sets />} />
          <Route path="/discount" element={<Discount />} />
          <Route path="/new" element={<NewBooks />} />
          <Route path="/about" element={<About />} />
          <Route path="/testimonial" element={<About />} />
          <Route path="/reviews" element={<Testimonial />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      <main className="main"></main>
      <DeferredWardaAssistant />
      <Footer />
      <a href="#" className="scrollup" id="scroll-up">
        <i className="ri-arrow-up-line" />
      </a>
    </>
  );
}

export default App;
