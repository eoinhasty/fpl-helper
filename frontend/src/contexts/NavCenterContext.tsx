import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";

type NavCenterContextValue = {
  navCenter: ReactNode;
  setNavCenter: (node: ReactNode) => void;
};

const NavCenterContext = createContext<NavCenterContextValue | null>(null);

export function NavCenterProvider({ children }: { children: ReactNode }) {
  const [navCenter, setNavCenter] = useState<ReactNode>(null);
  const value = useMemo(() => ({ navCenter, setNavCenter }), [navCenter]);
  return (
    <NavCenterContext.Provider value={value}>
      {children}
    </NavCenterContext.Provider>
  );
}

export function useNavCenter() {
  const ctx = useContext(NavCenterContext);
  if (!ctx) throw new Error("useNavCenter must be used inside NavCenterProvider");
  return ctx;
}

// Call inside any page to inject content into the TopNav center slot.
// Clears automatically on unmount. Wrap the node in useMemo to avoid thrashing.
export function useSetNavCenter(node: ReactNode) {
  const { setNavCenter } = useNavCenter();
  useEffect(() => {
    setNavCenter(node);
    return () => setNavCenter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}
