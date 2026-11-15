-- ========================================================
-- AL-WARDA PARFUMES DATABASE SCHEMA FOR SUPABASE
-- URL: https://mfvenfrmlkxqgvdtedet.supabase.co
-- ========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. CATEGORIES TABLE
create table if not exists public.categories (
    id text primary key,
    name text not null,
    slug text not null unique,
    title text,
    image text,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. PERFUMES TABLE
create table if not exists public.perfumes (
    id serial primary key,
    slug text not null unique,
    name text not null,
    brand text not null default 'Al-Warda',
    category text not null references public.categories(id) on delete cascade,
    notes_summary text,
    price numeric(10,2) not null,
    currency text not null default 'EUR',
    price_mdl numeric(10,2),
    volume text default '100ml / 3.4 FL.OZ.',
    concentration text default 'Eau De Parfum',
    gender text default 'Unisex',
    rating numeric(2,1) default 5.0,
    reviews_count integer default 0,
    is_best_seller boolean default false,
    is_featured boolean default false,
    in_stock boolean default true,
    image text not null,
    full_card_image text,
    top_notes text[],
    heart_notes text[],
    base_notes text[],
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. CART TABLE
create table if not exists public.cart (
    id serial primary key,
    user_id uuid,
    perfume_id text not null,
    title text not null,
    price numeric(10,2) not null,
    image text,
    quantity integer not null default 1,
    link text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. ORDERS TABLE
create table if not exists public.orders (
    id serial primary key,
    user_id uuid,
    customer_name text not null,
    customer_email text not null,
    customer_phone text not null,
    delivery_address jsonb,
    items jsonb not null,
    total_amount numeric(10,2) not null,
    currency text default 'EUR',
    status text default 'pending', -- pending, processing, shipped, completed, cancelled
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. REVIEWS TABLE
create table if not exists public.reviews (
    id serial primary key,
    perfume_id text not null,
    user_name text not null,
    rating integer not null check (rating >= 1 and rating <= 5),
    comment text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. INQUIRIES / CONTACT MESSAGES
create table if not exists public.inquiries (
    id serial primary key,
    user_id uuid,
    user_email text,
    customer_name text,
    message text not null,
    status text default 'open',
    notifications_user integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ENABLE ROW LEVEL SECURITY (RLS)
alter table public.categories enable row level security;
alter table public.perfumes enable row level security;
alter table public.cart enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.inquiries enable row level security;

-- POLICIES FOR PUBLIC READ ACCESS
create policy "Allow public read categories" on public.categories for select using (true);
create policy "Allow public read perfumes" on public.perfumes for select using (true);
create policy "Allow public read reviews" on public.reviews for select using (true);

-- POLICIES FOR CART
create policy "Allow anon and auth cart operations" on public.cart for all using (true) with check (true);

-- POLICIES FOR ORDERS
create policy "Allow insert orders" on public.orders for insert with check (true);
create policy "Allow user view own orders" on public.orders for select using (true);

-- POLICIES FOR INQUIRIES
create policy "Allow anon insert inquiries" on public.inquiries for insert with check (true);
create policy "Allow public select inquiries" on public.inquiries for select using (true);

-- SEED ALL 13 PARFUM CATEGORIES
insert into public.categories (id, name, slug, title, image, description)
values
  ('oud', 'OUD', 'oud', 'Oud Collection', '/assets/img/categories/cat-oud.jpg', 'Deep, resinous agarwood from ancient Arabian traditions.'),
  ('amber-oriental', 'AMBER & ORIENTAL', 'amber-oriental', 'Amber & Oriental Collection', '/assets/img/categories/cat-amber.jpg', 'Glowing solar resins, warm vanilla, and magnetic balsamic accords.'),
  ('spicy', 'SPICY', 'spicy', 'Spicy Collection', '/assets/img/categories/cat-spicy.jpg', 'Royal saffron, black pepper, cardamom, and warm cinnamon bark.'),
  ('floral', 'FLORAL', 'floral', 'Floral Collection', '/assets/img/categories/cat-floral.jpg', 'Imperial Taif roses, night-blooming jasmine, and velvet petals.'),
  ('gourmand', 'GOURMAND & SWEET', 'gourmand', 'Gourmand & Sweet Collection', '/assets/img/categories/cat-gourmand.jpg', 'Roasted hazelnuts, melted caramel, bourbon vanilla, and dark cocoa praline.'),
  ('musk', 'MUSK', 'musk', 'Musk Collection', '/assets/img/categories/cat-musk.jpg', 'Cloud-like white musk, pure cashmere silk, and tender powdery flowers.'),
  ('woody-fougere', 'WOODY & FOUGÈRE', 'woody-fougere', 'Woody & Fougère Collection', '/assets/img/categories/cat-woody.jpg', 'Highland cedar, wild lavender needles, vetiver, and smoky cypress.'),
  ('leather', 'LEATHER', 'leather', 'Leather Collection', '/assets/img/categories/cat-leather.jpg', 'Tanned saddle leather, dried birch tar, smokey incense, and golden amber.'),
  ('citrus-fresh', 'FRESH & CITRUS', 'citrus-fresh', 'Fresh & Citrus Collection', '/assets/img/categories/cat-citrus.jpg', 'Sun-drenched Calabrian bergamot, blood orange, and crystal drops.'),
  ('fruity', 'FRUITY', 'fruity', 'Fruity Collection', '/assets/img/categories/cat-fruity.jpg', 'Ruby pomegranate seeds, velvet sun-ripened peach, and wild blackberries.'),
  ('green-herbal', 'GREEN & HERBAL', 'green-herbal', 'Green & Herbal Collection', '/assets/img/categories/cat-green.jpg', 'Crushed wild mint, rosemary twigs, Galbanum, and green tea leaves.'),
  ('chypre', 'CHYPRE', 'chypre', 'Chypre Collection', '/assets/img/categories/cat-chypre.jpg', 'Aristocratic oakmoss, earthy patchouli, labdanum, and white blossoms.'),
  ('aquatic', 'AQUATIC', 'aquatic', 'Aquatic Collection', '/assets/img/categories/cat-aquatic.jpg', 'Arabian Sea breezes, oceanic minerals, sea salt, and ozonic blue mist.')
on conflict (id) do update set
  name = excluded.name,
  image = excluded.image,
  description = excluded.description;

-- SEED PERFUMES
insert into public.perfumes (
  slug, name, brand, category, notes_summary, price, currency, price_mdl,
  volume, concentration, gender, rating, reviews_count, is_best_seller, is_featured, in_stock,
  image, full_card_image, top_notes, heart_notes, base_notes, description
)
values
(
  'raghba',
  'RAGHBA',
  'Al-Warda Selection',
  'oud',
  'Warm · Sweet · Oriental',
  45.00,
  'EUR',
  890.00,
  '100ml / 3.4 FL.OZ.',
  'Eau De Parfum',
  'Unisex',
  4.9,
  128,
  true,
  true,
  true,
  '/assets/img/categories/cat-oud.jpg',
  '/assets/img/categories/cat-oud.jpg',
  array['Sugar', 'Agarwood (Oud)', 'Vanilla'],
  array['Incense', 'Nutmeg', 'Sandalwood'],
  array['Amber', 'Musk', 'Benzoin'],
  'A sumptuous feast of warm oriental delights. Raghba opens with crystalline sugar and velvety oud, transitioning into mystical smoky incense and finishing with intoxicating amber and Madagascar vanilla.'
),
(
  'asad',
  'ASAD',
  'Al-Warda Selection',
  'spicy',
  'Woody · Spicy · Bold',
  52.00,
  'EUR',
  990.00,
  '100ml / 3.4 FL.OZ.',
  'Eau De Parfum',
  'For Men / Unisex',
  5.0,
  194,
  true,
  true,
  true,
  '/assets/img/categories/cat-spicy.jpg',
  '/assets/img/categories/cat-spicy.jpg',
  array['Black Pepper', 'Pineapple', 'Tobacco'],
  array['Roasted Coffee', 'Patchouli', 'Iris'],
  array['Amber', 'Vanilla', 'Dry Woods', 'Benzoin', 'Labdanum'],
  'A bold, commanding statement of royal masculine energy. Spicy black pepper and rich cured tobacco blend seamlessly into roasted dark coffee, crowned by a majestic dry amber and golden vanilla trail.'
),
(
  'yara',
  'YARA',
  'Al-Warda Selection',
  'floral',
  'Floral · Fruity · Elegant',
  48.00,
  'EUR',
  920.00,
  '100ml / 3.4 FL.OZ.',
  'Eau De Parfum',
  'For Women / Unisex',
  4.8,
  230,
  true,
  true,
  true,
  '/assets/img/categories/cat-floral.jpg',
  '/assets/img/categories/cat-floral.jpg',
  array['Heliotrope', 'Orchid', 'Tangerine'],
  array['Gourmand Accord', 'Tropical Fruits'],
  array['Vanilla', 'White Musk', 'Sandalwood'],
  'A dreamy cloud of delicacy and allure. Yara wraps you in powdered heliotrope and exotic orchids, layered over sweet creamy tropical fruits, sitting upon a soft pillow of spun vanilla and white musk.'
),
(
  'al-warda-royal',
  'AL-WARDA SIGNATURE ROYAL',
  'Al-Warda Exclusive',
  'amber-oriental',
  'Taif Rose · Royal Amber · Saffron',
  75.00,
  'EUR',
  1450.00,
  '100ml / 3.4 FL.OZ.',
  'Extrait De Parfum',
  'Unisex',
  5.0,
  86,
  false,
  true,
  true,
  '/assets/img/categories/cat-amber.jpg',
  '/assets/img/categories/cat-amber.jpg',
  array['Taif Rose', 'Persian Saffron', 'Pink Pepper'],
  array['Damascena Rose', 'Royal Cambodian Oud', 'Geranium'],
  array['Baltic Amber', 'Royal White Musk', 'Golden Frankincense'],
  'The flagship jewel of Al-Warda. Distilled from the prized morning-picked roses of Taif and precious dark agarwood, enveloped in a heart of crystalline amber. Unforgettable longevity and regal sillage.'
),
(
  'khamrah',
  'KHAMRAH',
  'Al-Warda Selection',
  'gourmand',
  'Sweet · Cinnamon · Vanilla · Warm Spicy',
  55.00,
  'EUR',
  1050.00,
  '100ml / 3.4 FL.OZ.',
  'Eau De Parfum',
  'Unisex',
  4.9,
  167,
  true,
  true,
  true,
  '/assets/img/categories/cat-gourmand.jpg',
  '/assets/img/categories/cat-gourmand.jpg',
  array['Cinnamon', 'Nutmeg', 'Bergamot'],
  array['Dates', 'Praline', 'Tuberose', 'Mahonial'],
  array['Bourbon Vanilla', 'Tonka Bean', 'Benzoin', 'Myrrh', 'Amberwood'],
  'A decadent, cozy elixir reminiscent of royal palaces in Dubai. Warm cinnamon and dates mingle with molten praline and rich tonka bean, delivering a long-lasting gourmand amber masterpiece.'
)
on conflict (slug) do update set
  name = excluded.name,
  price = excluded.price,
  price_mdl = excluded.price_mdl,
  notes_summary = excluded.notes_summary,
  image = excluded.image,
  description = excluded.description;
