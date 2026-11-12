import React, { useState } from "react";
import { t } from "../context/translations";
import { ProductsManager } from "./ProductsManager";
import { ProductImageQueue } from "./ProductImageQueue";
import { FragranceNotesQueue } from "./FragranceNotesQueue";

const privilegedTabs = [
  { key: "users", label: "privileged.tabs.users", icon: "ri-user-line" },
  { key: "privileged", label: "privileged.tabs.privileged", icon: "ri-vip-crown-line" },
  { key: "coupons", label: "privileged.tabs.coupons", icon: "ri-coupon-3-line" },
  { key: "orders", label: "privileged.tabs.orders", icon: "ri-shopping-bag-3-line" },
  { key: "git-actions", label: "privileged.tabs.gitActions", icon: "ri-github-fill" },
  { key: "products", label: "privileged.tabs.products", icon: "ri-store-2-line" },
  { key: "product-images", label: "privileged.tabs.productImages", icon: "ri-image-edit-line" },
  { key: "fragrance-notes", label: "privileged.tabs.fragranceNotes", icon: "ri-flask-line" },
  { key: "other", label: "privileged.tabs.other", icon: "ri-settings-2-line" },
];

export function Privileged() {
  const [activeSection, setActiveSection] = useState("users");

  const tabBtns = privilegedTabs.map((tab) => (
    <button
      key={tab.key}
      type="button"
      role="tab"
      aria-selected={activeSection === tab.key}
      className={`privileged__nav-btn ${activeSection === tab.key ? "privileged__nav-btn--active" : ""}`}
      onClick={() => setActiveSection(tab.key)}
    >
      <i className={tab.icon} />
      <span>{t(tab.label)}</span>
    </button>
  ));

  return (
    <div className="privileged">
      <div className="privileged__nav-buttons" role="tablist">
        {tabBtns}
      </div>

      <div className="privileged__panel">
        {activeSection === "users" && <div>{t("privileged.users.section")}</div>}
        {activeSection === "products" && (
          <div className="privileged__products-section">
            <ProductsManager />
            <ProductImageQueue />
            <FragranceNotesQueue />
          </div>
        )}
        {activeSection === "product-images" && <ProductImageQueue />}
        {activeSection === "fragrance-notes" && <FragranceNotesQueue />}
        {activeSection === "other" && <div>{t("privileged.other")}</div>}
      </div>
    </div>
  );
}