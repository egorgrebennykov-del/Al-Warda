import { useState, useEffect, useCallback } from "react";
import { getCart, findCartItem, togglePerfumeInCart } from "../../utils/cart";
import { useAuth } from "../context/AuthContext";

export function useCartState() {
  const { user } = useAuth();
  const userId = user?.id;
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshCart = useCallback(async () => {
    try {
      const items = await getCart(userId);
      setCartItems(Array.isArray(items) ? items : []);
    } catch (e) {
      console.warn("Could not load cart in useCartState:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshCart();
    const handleUpdate = () => {
      refreshCart();
    };
    window.addEventListener("alwarda-cart-updated", handleUpdate);
    return () => {
      window.removeEventListener("alwarda-cart-updated", handleUpdate);
    };
  }, [refreshCart]);

  const isInCart = useCallback(
    (perfume, volKey = null) => {
      return Boolean(findCartItem(cartItems, perfume, volKey));
    },
    [cartItems]
  );

  const getCartItemFor = useCallback(
    (perfume, volKey = null) => {
      return findCartItem(cartItems, perfume, volKey);
    },
    [cartItems]
  );

  const toggleCart = useCallback(
    async (perfume, options = {}) => {
      return await togglePerfumeInCart(perfume, userId, options);
    },
    [userId]
  );

  return {
    cartItems,
    loading,
    isInCart,
    getCartItemFor,
    toggleCart,
    refreshCart,
  };
}
