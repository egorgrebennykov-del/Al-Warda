# Litera — Online Bookstore & Book Discovery Platform (React SPA)

**Litera** is a full-featured Single Page Application (SPA) built with **React 19**, **React Router**, **Supabase (PostgreSQL REST & Realtime BaaS)**, and a **Cloudflare Worker / Node.js API** backend. It aggregates Russian-language books across major bookstores with automatic EUR currency conversion, AI-powered book discovery (**Litera AI Assistant**), customer reviews with automated AI moderation and translation, shopping cart, multi-step checkout with promo coupons, order tracking, live support messenger, and a role-based Admin Control Panel.

---

## 🌐 Live Deployment & Repository Links

- **Live Deployed Application:** [https://litera.egor-grebennykov.workers.dev](https://litera.egor-grebennykov.workers.dev)
- **Cloudflare Worker Service View (View Worker status & config without login):** [https://litera.egor-grebennykov.workers.dev/cloudflare.html](https://litera.egor-grebennykov.workers.dev/cloudflare.html)
- **Supabase Database Explorer (View all tables without login):** [https://litera.egor-grebennykov.workers.dev/supabase.html](https://litera.egor-grebennykov.workers.dev/supabase.html)
- **GitHub Repository:** [https://github.com/egorgrebennykov-del/Litera](https://github.com/egorgrebennykov-del/Litera)

---

## 🔑 Test Users & Demo Promo Coupon

There are **3 pre-configured test accounts** in the database — 2 privileged accounts and 1 standard user account. Enter the **Name (Login)** and **Password** on the `/login` page:

| Account Type / Role | Name (Login) | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Privileged User 1** (`privileged`) | `test_vip_1` | `test_vip_1` | Full access + Admin Control Panel (`/privileged`), store badges, coupons, announcements, orders & inquiries management |
| **Privileged User 2** (`privileged`) | `test_vip_2` | `test_vip_2` | Full access + Admin Control Panel (`/privileged`), store badges, coupons, announcements, orders & inquiries management |
| **Standard User** (`user`) | `test_user` | `test_user` | Standard authenticated user access (`/profile`, `/cart`, `/checkout`, `/orders`, creating/editing/deleting own reviews on `/testimonial`) |

### 🎟️ Test Promo Coupon (`TEST`)
- **Promo Code:** `TEST`
- Entering the promo code **`TEST`** on the checkout page (`/checkout`) applies a **100% discount on the entire order and shipping (delivery)**, allowing you to test the complete order placement flow for free.

---

## 🚀 How to Install Packages and Run the Project Locally

### Prerequisites
- **Node.js** `v20+` and **npm**

### 1. Clone the Repository & Install Dependencies
```bash
git clone https://github.com/egorgrebennykov-del/Litera.git
cd Litera/Litera
npm install
```

### 2. Configure Environment Variables
The public Supabase URL and publishable key are already pre-configured as defaults in the application, or you can specify them in a `.env` file in the `Litera/` project root:
```env
VITE_SUPABASE_URL=https://qgxiisgzwcsevzyaoxvl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw
VITE_GEMINI_API_KEY=<your_gemini_api_key>
VITE_EMAILJS_PUBLIC_KEY=<your_emailjs_public_key>
VITE_EMAILJS_SERVICE_ID=service_zzl5x89
VITE_EMAILJS_TEMPLATE_ID=template_tco32u6
```

### 3. Start the Development Server
```bash
npm run dev
```
- This command launches both the **Vite React frontend** (`http://localhost:5173`) and the **local Node.js API server** (`http://localhost:3001`, proxied via `/api/*`) concurrently.

### 4. Production Build & Preview
```bash
npm run build
npm run preview
```

---

## 🏗️ Project Architecture & Folder Structure

```text
Litera/
├── public/
│   └── assets/                  # Static images, favicons, and global responsive CSS (styles.css)
├── server/                      # Backend API (Cloudflare Worker & Node.js HTTP server)
│   ├── worker.js                # Cloudflare Worker entry point (/api/* routes + scheduled crons)
│   ├── index.js                 # Local Node.js API server
│   ├── catalogActionsService.js # Automated catalog & EUR exchange rate synchronization with Supabase
│   ├── literaAssistantService.js# AI Book Assistant (Google Gemini + live catalog search)
│   ├── emailService.js          # Transactional email service
│   └── *Service.js              # Real-time bookstore scrapers/adapters (Librarius, Carturesti, Ulysses, etc.)
├── src/
│   ├── components/              # Modular component-based architecture (each with its own CSS file)
│   │   ├── announcements/       # SmallAnnouncements & LargeAnnouncementRoulette (touch-enabled carousel)
│   │   ├── bookdetails/         # BookDetails.jsx & BookDetails.css (detailed book view)
│   │   ├── carouselcontrols/    # Reusable carousel navigation controls
│   │   ├── cart/                # Cart.jsx & Cart.css (shopping cart management)
│   │   ├── checkout/            # Checkout.jsx & Checkout.css (2-step checkout, saved addresses, coupons)
│   │   ├── common/              # Reusable UI components (BookImage, PhoneInput, FlagIcon, ConfirmModal)
│   │   ├── contacts/            # Contacts.jsx & Contacts.css (founder profile & direct channels)
│   │   ├── discount/            # Discount.jsx & Discount.css (discounted books catalog)
│   │   ├── featured/            # Featured.jsx & Featured.css (curated book picks catalog)
│   │   ├── footer/              # Footer.jsx
│   │   ├── header/              # Header.jsx & Header.css (navigation, theme toggle, language switcher, messenger)
│   │   ├── home/                # Home.jsx & Home.css (hero showcase, announcements, featured carousel)
│   │   ├── join/                # Join.jsx (newsletter subscription)
│   │   ├── litera/              # LiteraAssistant.jsx & LiteraCharacter.jsx (interactive AI assistant)
│   │   ├── login/               # Login.jsx (authentication & 6-digit email code password reset flow)
│   │   ├── newbooks/            # NewBooks.jsx & NewBooks.css (new arrivals catalog)
│   │   ├── notfound/            # NotFound.jsx & NotFound.css (404 page with quick search)
│   │   ├── orders/              # Orders.jsx & Orders.css (user's current & completed orders)
│   │   ├── privileged/          # Privileged.jsx & Privileged.css (Admin Control Panel)
│   │   ├── profile/             # Profile.jsx & Profile.css (user profile & role badges)
│   │   ├── search/              # Search.jsx (search overlay modal)
│   │   ├── searchresults/       # SearchResults.jsx & SearchResults.css (live multi-store streaming search)
│   │   ├── signup/              # SignUp.jsx (registration with 6-digit email verification code)
│   │   └── testimonial/         # Testimonial.jsx & Testimonial.css (customer reviews with full CRUD)
│   ├── context/                 # React Context API providers
│   │   ├── languageContext.jsx  # Bilingual RU/EN localization Context
│   │   ├── ConfirmContext.jsx   # Global modal confirmation & alert dialog Context
│   │   └── searchCache.jsx      # In-memory search results cache Context
│   ├── utils/                   # UI helpers (custom validation tooltips)
│   ├── App.jsx                  # Root router configuration, route guards, lazy loading, theme management
│   └── main.jsx                 # React DOM entry point wrapping global Context providers
└── utils/                       # Data access layer & Supabase REST/SDK services
    ├── auth.js                  # Register, login, logout, bcrypt hashing, email verification, password reset
    ├── cart.js                  # Cart CRUD operations in Supabase (cart table)
    ├── feedbacks.js             # Reviews CRUD operations in Supabase (feedbacks table) + AI moderation
    ├── orders.js                # Order creation & status management (orders_in_progress, orders_completed)
    ├── coupons.js               # Promo code & discount coupon CRUD + validation (coupons table)
    ├── inquiries.js             # Customer-admin chat & inquiry management (inquiries table)
    ├── announcements.js         # Site-wide banners & posters CRUD (announcements table)
    └── searchBooks.js           # Progressive streaming book search across stores
```

---

# React – Exam Project: Functional Guide

## 1. Project Overview

- **Application Name:** Litera
- **Application Category / Topic:** E-commerce Site & Book Discovery Platform (Online Bookstore)
- **Main Purpose:**
  Litera is an online bookstore and book discovery platform designed to make Russian-language literature easily accessible to readers across Europe. It aggregates books in real time from multiple bookstores, automatically converts local prices into Euros (`EUR`) using daily synchronized exchange rates, and provides an interactive AI assistant (*Litera*) to help readers find books by plot, mood, or author. Users can browse curated catalogs (Book Picks, Discounts, New Arrivals), read and publish verified customer reviews, manage their shopping cart and delivery addresses, apply promotional coupons, place orders, and communicate directly with administrators.

---

## 2. User Access & Permissions

### Guest (Not Authenticated)
- **Available pages / routes:**
  - `/` (Home page with live announcements, posters, and featured publisher showcase)
  - `/featured` (Curated Book Picks catalog)
  - `/discount` (Discounted Books catalog with percentage badges)
  - `/new` (New Arrivals catalog)
  - `/search?q=...` and `/search/:query` (Live multi-store search results page)
  - `/book?url=...` and `/book/:bookId` (Book Details page with full metadata, ISBN, synopsis, and availability)
  - `/testimonial` (Customer Reviews page — read-only access for guests, with AI translation toggle)
  - `/contacts` (Founder profile & direct contact channels)
  - `/login` and `/sign-up` (Guest-only authentication and registration pages, plus 6-digit email password reset)
  - `/cart`, `/checkout`, `/orders` (Display guest informational prompts inviting the visitor to sign in or register)
- **Public data shown:**
  - Book catalogs, cover images, titles, authors, publishers, descriptions, ISBNs, EUR prices, discount percentages, active site announcements, and approved customer reviews.
  - Guests can also interact with the **Litera AI Assistant** to get book recommendations and send guest support inquiries (which are delivered to their email when an admin replies).

### Authenticated User
- **Main sections / pages:**
  - All public catalog pages (`/`, `/featured`, `/discount`, `/new`, `/search`, `/book`, `/testimonial`, `/contacts`)
  - `/profile` (Private user profile page displaying personal details, roles, phones, and saved addresses)
  - `/cart` (Interactive shopping cart with quantity controls and item removal)
  - `/checkout` (2-step order checkout with saved delivery addresses, phone book, and promo coupon application — use test promo code `TEST` for a **100% discount** on the entire order and delivery)
  - `/orders`, `/orders/current`, `/orders/completed`, `/orders/:tab` (Order history split into active and completed orders)
  - `/privileged` / `/admin` (Role-restricted Admin Control Panel available to users with `privileged` status: `vip`, `admin`, `developer`)
- **Details pages:**
  - `/book?url=...` (`/book/:bookId`) with interactive quantity selector and one-click **Add to Cart / Remove from Cart** functionality.
- **Create / Edit / Delete actions:**
  - **Customer Reviews (`feedbacks` collection on `/testimonial`):** Logged-in users can **Create** new reviews (with 1–5 star ratings and text), **Edit (Update)** their own reviews inline, and **Delete** their own reviews. Only the author of a review sees the Edit and Delete buttons for that record (`Number(currentUserId) === Number(item.user_id)`).
  - **Shopping Cart (`cart` collection on `/cart`, `/book`, and catalog pages):** Logged-in users can **Create** cart items, **Read** their cart, **Update** item quantities, and **Delete** items from their cart.
  - **Saved Delivery Addresses & Phones (`user.adresses` & `user.phones` on `/checkout`):** Logged-in users can **Create**, **Read**, and **Delete** saved delivery addresses and phone numbers.
  - **Orders & Inquiries:** Logged-in users can **Create** orders (`/checkout`) and real-time support chat threads with administrators.
  - **Privileged / Admin Users (`/privileged`):** Can also perform full CRUD on site-wide **Announcements** (`announcements`), **Discount Coupons** (`coupons`), **Users** (`user`), and manage **Orders** and **GitHub Actions**.
- **Pre-configured Test Accounts & Promo Coupon for Reviewers:**
  - **Privileged Users (2 accounts):**
    1. Name / Login: `test_vip_1` | Password: `test_vip_1`
    2. Name / Login: `test_vip_2` | Password: `test_vip_2`
  - **Standard Authenticated User (1 account):**
    3. Name / Login: `test_user` | Password: `test_user`
  - **Test Promo Coupon (`/checkout`):**
    - Promo Code: `TEST` — entering this coupon at checkout gives a **100% discount on the entire order and shipping (delivery)** so reviewers can test the full checkout and order placement flow for free.

---

## 3. Authentication & Session Handling

### Authentication Flow
1. **When the app loads:**
   - The application initializes global Context providers (`LanguageProvider`, `ConfirmProvider`, `SearchCacheProvider`) and checks the current user session via `isLoggedIn()` and `getCookieUser()` in `utils/auth.js`, which reads and validates the signed/encoded session cookie (`kazbook_user`).
2. **How authentication status is checked:**
   - Components and route guards call `isLoggedIn()`, `getCookieUser()`, and `isPrivileged()` to determine whether the user is a guest, a standard authenticated user, or a privileged administrator.
   - On `/profile` and `/privileged`, `getProfile()` also verifies the user record directly against the Supabase `user` table.
3. **On successful registration (`/sign-up`):**
   - When a user fills out the registration form, a 6-digit verification code is generated and sent to their email via EmailJS (`sendVerificationCodeEmail`).
   - Once the user enters the matching 6-digit code, `register()` hashes the password with `bcryptjs` (`bcrypt.hash(password, 12)`), inserts the new user record into the Supabase `user` table, stores the user session in the `kazbook_user` cookie, and redirects the user to `/` (or the `?redirect=` target).
4. **On successful login (`/login`) or password reset:**
   - `login()` queries the Supabase `user` table by email/identifier, verifies the password against `password_hash` using `bcrypt.compare()`, sets the `kazbook_user` session cookie, and navigates to the target page.
   - If the user clicks **"Forgot password?"**, they receive a 6-digit verification code by email, enter the code and their new password, see a confirmation screen confirming the password change, and click **"Go to Home Page"** to continue as an authenticated user.
5. **On logout:**
   - Clicking **Logout** on `/profile` calls `logout()`, which deletes the `kazbook_user` cookie (`deleteCookie("kazbook_user")`) and redirects the user to `/`.

### Session Persistence
- **How is the user session stored?**
  - The session identity (`id`, `firstName`, `lastName`, `email`, `phone`, `status`, `roles`) is persisted in the browser cookie `kazbook_user` (with a 7-day expiration and `SameSite=Lax`) and synchronized with Supabase via `getProfile()`.
  - UI preferences such as theme (`litera_theme`: light/dark) and language (`litera_language`: `ru`/`en`) are also persisted in cookies/localStorage and shared via Context.
- **How is automatic login handled after a page refresh?**
  - On page refresh, `getCookieUser()` synchronously parses the `kazbook_user` cookie before the first React render, so the user remains logged in without any flicker or unexpected redirect, while `getProfile()` refreshes their latest profile and role data from Supabase in the background.

---

## 4. Routing Structure

### Route Guards Logic
- **`<GuestOnly>` Guard (`src/App.jsx`):**
  - Wraps `/login` and `/sign-up`. If `isLoggedIn()` is `true`, the user is immediately redirected to `/` (`<Navigate to="/" replace />`), preventing logged-in users from seeing the Login or Register pages.
- **`<PrivateRoute>` Guard (`src/App.jsx`, `Profile.jsx`, `Privileged.jsx`):**
  - Wraps `/profile`, `/privileged`, and `/admin`. Unauthenticated users attempting to access `/profile` are automatically redirected to `/login?redirect=%2Fprofile`.
  - On `/privileged` (`/admin`), both `isLoggedIn()` and `isPrivileged()` are verified (including a server-side check via `getProfile()`); unauthorized users are redirected to `/`.

### Main Routes
The application defines **15+ client-side routes** in `src/App.jsx` (using React Router `Routes` and `Route` with code-splitting via `React.lazy` and `Suspense`):
1. `/` — `Home` (Dynamic homepage with active announcements, poster carousel, and publisher book showcase)
2. `/featured` — `Featured` (Dynamic catalog of curated Book Picks)
3. `/discount` — `Discount` (Dynamic catalog of discounted books with live EUR conversion)
4. `/new` — `NewBooks` (Dynamic catalog of new book arrivals)
5. `/search` & `/search/:query` — `SearchResults` (Dynamic real-time multi-store search results)
6. `/book` & `/book/:bookId` — `BookDetails` (Dynamic book details page)
7. `/testimonial` — `Testimonial` (Dynamic customer reviews page with full CRUD)
8. `/cart` — `Cart` (Dynamic user shopping cart)
9. `/checkout` — `Checkout` (Dynamic 2-step checkout with address management and coupon validation)
10. `/orders`, `/orders/current`, `/orders/completed`, `/orders/:tab` — `Orders` (Dynamic user order tracking)
11. `/profile` — `Profile` (Private user profile page)
12. `/privileged` & `/admin` — `Privileged` (Private Admin Control Panel)
13. `/contacts` — `Contacts` (Founder information and direct contact channels)
14. `/login` — `Login` (Guest-only login and password reset flow)
15. `/sign-up` — `SignUp` (Guest-only registration with email code verification)
16. `/404` & `*` — `NotFound` (Custom 404 page with search and quick links)

### Nested & Parameterized Routes
- **Routes with URL parameters (`useParams` & `useSearchParams`):**
  1. `/orders/:tab` (e.g. `/orders/current`, `/orders/completed`) — uses `useParams()` (`tab`) to switch between active and completed order collections.
  2. `/book/:bookId` and `/book?url=<encodedBookUrl>&q=<query>&source=<source>` — uses `useParams()` (`bookId`) and `useSearchParams()` (`url`, `q`, `source`) to load the specific book's details and preserve back-navigation context.
  3. `/search/:query` and `/search?q=<searchQuery>` — uses `useParams()` (`query`) and `useSearchParams()` (`q`) to execute live book searches across stores.

---

## 5. List → Details Flow

### Catalog / List Pages
- **Displayed Data:**
  - The catalog pages (`/featured`, `/discount`, `/new`, and `/search`) display responsive grids of book cards. Each card renders the high-resolution cover (`<BookImage>`), book title, price in `EUR` (converted via the live `exchange_rate` table), discount badge (`-%` on `/discount`), and direct **Add to Cart** / quantity controls.
- **User Interaction (Search / Filter / Sort / Stream):**
  - Users can open the global search modal (`Search.jsx`) from any page or use the Litera AI Assistant to search by title, author, genre, or keywords.
  - On `/search`, results stream progressively in two waves (a fast Page-1 wave followed by deep multi-page catalog aggregation and deduplication) with a live inline progress indicator above the grid.

### Details Page (`/book`)
- **How navigation is triggered:**
  - Clicking any book card in `Home`, `Featured`, `Discount`, `NewBooks`, `SearchResults`, `Cart`, or `LiteraAssistant` navigates to `/book?url=${encodeURIComponent(book.url)}` via React Router's `<Link>` or `useNavigate()`.
- **Data received via route parameters:**
  - `BookDetails.jsx` reads the `url` / `bookId` parameter via `useSearchParams()` / `useParams()`, immediately renders preview state if passed via `location.state.book`, and fetches full book metadata (`getBookDetails(url)`) and the EUR exchange rate (`getExchangeRate()`) from `/api/book-details` and Supabase.

---

## 6. Data Source & Backend

### Backend Type
- **Hybrid Real Backend: Supabase (PostgreSQL BaaS) + Cloudflare Worker / Node.js REST API (`server/worker.js` & `server/index.js`)**
  - **Supabase (PostgreSQL REST API):** Persists all application collections:
    - `user` (registered users, hashed passwords, roles, saved addresses, phone numbers)
    - `feedbacks` (customer reviews with star ratings, AI moderation status, and RU/EN translations)
    - `cart` (persistent per-user shopping cart items)
    - `orders_in_progress` & `orders_completed` (customer orders)
    - `coupons` (public and personalized discount promo codes)
    - `announcements` (bilingual site banners and promotional posters)
    - `inquiries` (customer-to-admin support chat threads and message history)
    - `book_picks`, `discounts`, `new_books`, `books_on_home_page`, `exchange_rate` (synchronized catalog snapshots and EUR/MDL exchange rates)
  - **Cloudflare Worker / Node.js Backend (`/api/*`):**
    - `/api/search-*` & `/api/book-details` — real-time book scraping and metadata extraction across 5 bookstores (`librarius.md`, `carturesti.md`, `ulysses.md`, `carteamea.md`, `biblion.md`).
    - `/api/litera-chat` — Server-Sent Events (SSE) streaming endpoint for the Gemini-powered Litera AI Assistant.
    - `/api/run-action` & Scheduled Cron Triggers — automated catalog and exchange rate synchronization.

---

## 7. Data Operations (CRUD)

The project implements full **Create, Read, Update, and Delete (CRUD)** operations across multiple non-User collections (`feedbacks`, `cart`, `announcements`, `coupons`). Below is the primary user-facing CRUD implementation on the **`feedbacks` (Customer Reviews)** collection (`/testimonial`, `src/components/testimonial/Testimonial.jsx` & `utils/feedbacks.js`), as well as the **`cart`** collection:

### Create (`POST`)
- **How the user creates new data:**
  - On `/testimonial`, a logged-in user selects a star rating (1–5 stars) and/or writes a review in the controlled form, then clicks **"Publish review"**.
  - `addFeedback()` in `utils/feedbacks.js` validates and moderates the review via Google Gemini AI (`moderateAndTranslateFeedback`), automatically translates it between Russian and English, and sends a `POST /rest/v1/feedbacks` request to Supabase.
  - Similarly, clicking **"Add to cart"** on any book sends a `POST /rest/v1/cart` request via `addToCart()`.

### Read (`GET`)
- **Where data is fetched and displayed:**
  - When `/testimonial` mounts, `useEffect` calls `getFeedbacks()`, which executes `GET /rest/v1/feedbacks?select=*` against Supabase, sorts reviews chronologically, and renders them with author initials, timestamps, star ratings, and bilingual translation toggles.
  - Catalog pages (`/`, `/featured`, `/discount`, `/new`), `/cart`, and `/orders` similarly fetch their live records via `GET` requests from Supabase.

### Update (`PATCH`)
- **How the author edits an existing record:**
  - In `Testimonial.jsx`, each review card checks ownership: `const isOwn = loggedIn && currentUserId != null && Number(currentUserId) === Number(item.user_id);`.
  - Only the author of a review sees the **"Edit"** (`Редактировать`) button. Clicking it opens an inline controlled editor pre-populated with the review's current text and star rating.
  - Submitting the edit calls `updateFeedback({ id, userId, feedback, stars })`, which re-runs AI moderation/translation and sends `PATCH /rest/v1/feedbacks?id=eq.${id}&user_id=eq.${userId}` to Supabase.
- **How the UI is updated after the change:**
  - The component updates the `feedbacks` state array in place (`setFeedbacks(prev => prev.map(...))`) and exits edit mode immediately without requiring a page reload.
  - In `/cart`, changing an item's quantity calls `updateCartQuantity()` (`PATCH /rest/v1/cart`) and updates the item's quantity and subtotal in state.

### Delete (`DELETE`)
- **How the author deletes an existing record:**
  - Only the review author (`isOwn === true`) sees the **"Delete"** (`Удалить`) button on their review card.
  - Clicking **"Delete"** opens a confirmation modal (`useConfirm()`). Upon confirmation, `deleteFeedback({ id, userId })` sends `DELETE /rest/v1/feedbacks?id=eq.${id}&user_id=eq.${userId}` to Supabase.
- **How the UI is updated after the change:**
  - The deleted review is immediately removed from local state via `setFeedbacks(prev => prev.filter(item => item.id !== id))`.

---

## 8. Forms & Validation

### Forms Used
1. **Login Form (`/login` — `Login.jsx`):** Email/login identifier and password.
2. **Password Reset Request & Verification Forms (`/login` — `Login.jsx`):** Email input, 6-digit verification code input, new password, and repeat new password.
3. **Registration & Email Verification Form (`/sign-up` — `SignUp.jsx`):** First name, last name, email, country-code phone input, password, repeat password, and 6-digit email verification code.
4. **Customer Review Create & Edit Forms (`/testimonial` — `Testimonial.jsx`):** Interactive 1–5 star selector and review text area.
5. **Checkout Address & Coupon Forms (`/checkout` — `Checkout.jsx`):** Recipient name, country, city, street, postal code, phone number with country selector, and promo coupon code form.
6. **Search Form (`Search.jsx` & `NotFound.jsx`):** Controlled search query input.
7. **Live Messenger / Guest Inquiry Form (`Header.jsx`):** Guest name, guest email, and message input.
8. **Admin Control Panel Forms (`/privileged` — `Privileged.jsx`):** Create User form, Create/Edit Announcement modal form, Create Discount Coupon modal form, and Inquiry Transfer form.

### Validation Rules
1. **Email Address (`SignUp.jsx`, `Login.jsx` password reset, `Header.jsx` guest chat):**
   - Must not be empty and must match a valid email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). During registration, uniqueness is also verified against Supabase (`checkEmailAvailable`), and during password reset, account existence is verified (`checkUserExistsForReset`).
2. **Verification Code (`SignUp.jsx`, `Login.jsx`):**
   - Input is sanitized to digits only (`value.replace(/\D/g, "").slice(0, 6)`), must be exactly 6 digits long, and must match the 6-digit code sent to the user's email.
3. **Password & Repeat Password (`SignUp.jsx`, `Login.jsx` — field with multiple validation rules):**
   - Must not be empty;
   - Must be at least **8 characters** long (`password.length >= 8`) and at most 72 characters;
   - `repeatPassword` must exactly match `password` (`password === repeatPassword`);
   - Custom interactive validation tooltips (`showValidationTooltip`) highlight the specific invalid input field and focus it automatically.
4. **Checkout Delivery Address & Coupon Code (`Checkout.jsx`):**
   - City (`addressForm.city`), Street (`addressForm.street`), and Phone Number (`phoneNumber`) are required before order submission;
   - Promo coupons are validated against expiration date, minimum/maximum order subtotal, single/limited usage caps, and user eligibility (`validateCouponForCart`).

---

## 9. React-Specific Techniques

### Hooks & Component Lifecycle
- **Hooks used across the application:**
  - `useState` — form state, loading/error states, modal visibility, pagination, and optimistic UI updates.
  - `useEffect` — data fetching on mount, URL parameter synchronization, scroll restoration, polling/realtime listeners, and DOM event cleanup.
  - `useRef` — focusing form inputs on validation errors, auto-scrolling chat containers, and detecting outside clicks for popovers.
  - `useMemo` & `useCallback` — memoizing filtered lists, country dial codes, coupon discount calculations, and context callbacks.
  - `useContext` (via custom hooks `useLanguage`, `useConfirm`, `useAlert`, `useSearchCache`) — consuming global application state.
  - `useNavigate`, `useLocation`, `useParams`, `useSearchParams` — client-side routing and URL parameter handling.
- **Example of Mount / Update / Unmount behavior:**
  - In `SearchResults.jsx` (and `BookDetails.jsx` / `Testimonial.jsx`), a `useEffect` runs on **mount** and **updates** whenever the search `query` URL parameter changes. It initializes `let cancelled = false`, triggers progressive streaming fetches (`searchBooks(query, { onProgress })`), and returns a **cleanup function on unmount** (`return () => { cancelled = true; }`) that aborts state updates if the user navigates away before the network request finishes. Similarly, `LoadingMessage` sets up a `setInterval` on mount and clears it with `clearInterval(id)` on unmount.

### Context API
1. **`LanguageContext` (`src/context/languageContext.jsx`):**
   - Shares `language` (`"ru"` | `"en"`), `setLanguage`, `toggleLanguage`, and the translation function `t(key)` across **all components** (`Header`, `Home`, `Featured`, `Discount`, `NewBooks`, `SearchResults`, `BookDetails`, `Cart`, `Checkout`, `Orders`, `Testimonial`, `Login`, `SignUp`, `Profile`, `Privileged`, `LiteraAssistant`, `Contacts`, `Footer`).
2. **`ConfirmContext` (`src/context/ConfirmContext.jsx`):**
   - Provides promise-based modal dialogs via `useConfirm()` and `useAlert()` consumed by `Testimonial`, `Checkout`, `Header`, `LiteraAssistant`, and `Privileged` for deletion confirmations and status alerts.
3. **`SearchCacheContext` (`src/context/searchCache.jsx`):**
   - Shares cached search results (`get`, `set`) between `Search.jsx` and `SearchResults.jsx` so navigating back from `BookDetails` to `SearchResults` restores results instantaneously.

### Component Styling
- Components are styled using dedicated **external CSS files** co-located with each component (e.g., `Home.css`, `BookDetails.css`, `SearchResults.css`, `Discount.css`, `Featured.css`, `NewBooks.css`, `Cart.css`, `Checkout.css`, `Orders.css`, `Testimonial.css`, `Profile.css`, `Privileged.css`, `LiteraAssistant.css`, `Contacts.css`, `Header.css`) alongside global design tokens, CSS custom properties (variables for light and dark themes), and responsive mobile media queries in `public/assets/css/styles.css`.

---

## 10. Typical User Flow

1. **Discovery & Browsing (Guest):**
   The visitor opens Litera (`/`), views active announcements and featured books, switches the interface language (RU/EN) or theme (Light/Dark), and browses curated catalogs (`/featured`, `/discount`, `/new`) or searches for a specific book (`/search?q=...`) or asks the **Litera AI Assistant** for recommendations.
2. **Inspecting Book Details:**
   The user clicks on a book card to open `/book?url=...`, where they inspect the high-resolution cover, author, publisher, ISBN, page count, availability badge, synopsis, and price in Euros.
3. **Registration / Authentication:**
   To purchase books or leave a review, the user navigates to `/sign-up`, fills out their details, verifies their email with the 6-digit code sent to their inbox, and is automatically signed in (or signs in via `/login`).
4. **Interacting & CRUD Operations (Reviews & Cart):**
   - The user visits `/testimonial` to publish a starred review, and can edit or delete their own review at any time.
   - The user adds books to their cart (`/cart`), adjusts item quantities, and proceeds to `/checkout`, where they enter or select a saved delivery address, apply a discount promo code, and place their order.
5. **Order Tracking & Support:**
   After checkout, the user sees their order confirmation with an order number (`#LB-...`) and tracks its status on `/orders/current` and `/orders/completed`, or messages the responsible administrator via the built-in support chat.

---

## 11. Error & Edge Case Handling

- **Authentication Errors:**
  - Invalid login credentials, unverified email codes, non-existent accounts during password reset, or duplicate emails during registration are caught and surfaced both via custom validation tooltips (`showValidationTooltip`) anchored to the input field and localized `role="alert"` error banners.
- **Network or Data Errors:**
  - All async API and Supabase calls are wrapped in `try / catch / finally` blocks. If a network request fails, components transition out of the loading state and render clear, localized error messages (`role="alert"`) with retry or back-navigation options instead of crashing.
  - `<BookImage>` implements a multi-stage `onError` fallback chain (switching CDN paths, falling back to the `/api/enhance-image` proxy, and finally rendering a clean styled book placeholder with the book's title if an external bookstore image is unavailable).
- **Empty or Missing Data States:**
  - Empty search queries or searches with no matches render a friendly "Nothing found" state; empty carts (`/cart`), empty order tabs (`/orders`), and empty review lists (`/testimonial`) display dedicated empty-state cards with icons and call-to-action buttons to return to the catalog.
  - Unknown URLs are caught by `<Route path="*" element={<NotFound />} />`, which renders a custom 404 page with a built-in book search bar and quick navigation links.
