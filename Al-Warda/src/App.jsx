import { lazy, Suspense, useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import Footer from "./components/footer/Footer";
import Header from "./components/header/Header";
import Home from "./components/home/Home";
import Search from "./components/search/Search";
import { isLoggedIn } from "../utils/auth";
import { useAuth } from "./context/AuthContext";
import { getCookie, setCookie } from "../utils/cookies";
import { getPerfumes } from "../utils/perfumes";

// Immediately warm critical perfumes data as soon as the bundle loads
if (typeof window !== "undefined") {
  getPerfumes().catch(() => {});
}

const loadFeatured = () => import("./components/featured/Featured");
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
const loadLiteraAssistant = () => import("./components/litera/LiteraAssistant");

const Featured = lazy(loadFeatured);
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
const LiteraAssistant = lazy(loadLiteraAssistant);

const THEME_COOKIE_KEY = "alwarda_theme";

function getInitialTheme() {
  if (typeof document === "undefined") return false;
  try {
    const saved = getCookie(THEME_COOKIE_KEY) || getCookie("litera_theme") || getCookie("theme");
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
  const navigate = useNavigate();
  const location = useLocation();
  const shouldRestoreScroll = Boolean(
    location.state?.restoreCartScroll ||
    location.state?.restoreDiscountScroll ||
    location.state?.restoreHomeScroll,
  );

  useEffect(() => {
    // Defer background prefetching until after initial page render is complete
    // so it never competes with homepage critical resources on first load
    const runIdlePrefetch = () => {
      fetch("/api/warmup", { method: "POST" }).catch(() => {});
      getBookPicks().catch(() => {});
      getDiscountSnapshot().catch(() => {});
      getNewBooks().catch(() => {});
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
    if (shouldRestoreScroll) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, shouldRestoreScroll]);

  useEffect(() => {
    document.body.classList.toggle("dark-theme", !lightTheme);
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
      <Search show={showSearch} onClose={() => setShowSearch(false)} />
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
            path="/admin"
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
          <Route path="/discount" element={<Discount />} />
          <Route path="/new" element={<NewBooks />} />
          <Route path="/about" element={<Testimonial />} />
          <Route path="/testimonial" element={<Testimonial />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      <main className="main"></main>
      <Suspense fallback={null}>
        <LiteraAssistant />
      </Suspense>
      <Footer />
      <a href="#" className="scrollup" id="scroll-up">
        <i className="ri-arrow-up-line" />
      </a>
    </>
  );
}

export default App;
