import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  getCookieUser,
  getProfile,
  isLoggedIn as authIsLoggedIn,
  isPrivileged as checkIsPrivileged,
  login as authLogin,
  logout as authLogout,
  register as authRegister,
  resolveUserRoles,
} from "../../utils/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCookieUser());
  const [loading, setLoading] = useState(true);

  // Sync / refresh session from backend on mount
  useEffect(() => {
    let isMounted = true;

    if (authIsLoggedIn()) {
      getProfile()
        .then((profile) => {
          if (!isMounted) return;
          if (profile) {
            setUser(profile);
          } else {
            setUser(null);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setUser(getCookieUser());
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setUser(null);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (identifier, password) => {
    await authLogin(identifier, password);
    const cookieUser = getCookieUser();
    setUser(cookieUser);
    try {
      const fullProfile = await getProfile();
      if (fullProfile) setUser(fullProfile);
    } catch {
      // keep cookieUser
    }
    return cookieUser;
  }, []);

  const register = useCallback(async (data) => {
    await authRegister(data);
    const cookieUser = getCookieUser();
    setUser(cookieUser);
    try {
      const fullProfile = await getProfile();
      if (fullProfile) setUser(fullProfile);
    } catch {
      // keep cookieUser
    }
    return cookieUser;
  }, []);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getProfile();
      if (profile) {
        setUser(profile);
        return profile;
      }
      setUser(null);
      return null;
    } catch {
      const fallback = getCookieUser();
      setUser(fallback);
      return fallback;
    }
  }, []);

  const updateUserLocal = useCallback((updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const isLoggedIn = useMemo(() => Boolean(user && user.id), [user]);
  const isPrivileged = useMemo(() => Boolean(user && checkIsPrivileged(user)), [user]);
  const roles = useMemo(() => resolveUserRoles(user), [user]);

  const value = useMemo(
    () => ({
      user,
      isLoggedIn,
      isPrivileged,
      roles,
      loading,
      login,
      register,
      logout,
      refreshUser,
      updateUserLocal,
    }),
    [
      user,
      isLoggedIn,
      isPrivileged,
      roles,
      loading,
      login,
      register,
      logout,
      refreshUser,
      updateUserLocal,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
