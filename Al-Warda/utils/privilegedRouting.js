export const PRIVILEGED_TAB_ALIASES = {
  users: "users",
  privileged: "privileged",
  priviledged: "privileged",
  admins: "privileged",
  roles: "privileged",
  coupons: "coupons",
  orders: "orders",
  inquiries: "inquiries",
  messenger: "inquiries",
  messages: "inquiries",
  announcements: "announcements",
  "git-actions": "git-actions",
  gitactions: "git-actions",
  git: "git-actions",
  actions: "git-actions",
  products: "products",
  tovary: "products",
  items: "products",
  stock: "products",
  stocks: "products",
  catalog: "products",
  qogita: "qogita",
  "product-images": "products",
  productimages: "products",
  images: "products",
  photos: "products",
  "fragrance-notes": "products",
  fragrancenotes: "products",
  fragrance: "products",
  notes: "products",
  pyramids: "products",
  descriptions: "products",
  description: "products",
  other: "other",
  misc: "other",
  settings: "other",
};

export const PRIVILEGED_SUBTAB_ALIASES = {
  list: "list",
  catalog: "list",
  products: "list",
  items: "list",
  tovary: "list",
  spisok: "list",

  images: "images",
  "product-images": "images",
  productimages: "images",
  photos: "images",
  photo: "images",
  image: "images",
  foto: "images",
  queue: "images",

  notes: "notes",
  "fragrance-notes": "notes",
  fragrancenotes: "notes",
  fragrance: "notes",
  pyramids: "notes",
  aromaty: "notes",
  noty: "notes",

  descriptions: "descriptions",
  description: "descriptions",
  opisanie: "descriptions",
  opasaniya: "descriptions",
  text: "descriptions",
};

export const PRIVILEGED_DIRECT_SUBTAB_MAP = {
  "product-images": "images",
  productimages: "images",
  images: "images",
  photos: "images",
  photo: "images",
  image: "images",
  foto: "images",
  "fragrance-notes": "notes",
  fragrancenotes: "notes",
  fragrance: "notes",
  notes: "notes",
  pyramids: "notes",
  aromaty: "notes",
  noty: "notes",
  descriptions: "descriptions",
  description: "descriptions",
  opisanie: "descriptions",
};

export function resolvePrivilegedTab(rawTab) {
  if (!rawTab) return "users";
  const key = String(rawTab).trim().toLowerCase();
  return PRIVILEGED_TAB_ALIASES[key] || "users";
}

export function resolveProductsSubTab(rawSubTab) {
  if (!rawSubTab) return "list";
  const key = String(rawSubTab).trim().toLowerCase();
  return PRIVILEGED_SUBTAB_ALIASES[key] || "list";
}

export function getPrivilegedBasePath(pathname = "") {
  if (pathname.startsWith("/priviledged")) return "/priviledged";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/privileged";
}
