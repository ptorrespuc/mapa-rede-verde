import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";

import {
  getCurrentSession,
  getUserContext,
  listGroups,
  listPointClassifications,
  listSpecies,
  signInWithPassword,
  signOut as apiSignOut,
} from "@/src/lib/api";
import { supabase } from "@/src/lib/supabase";
import type {
  GroupRecord,
  PointClassificationRecord,
  SpeciesRecord,
  UserContext,
} from "@/src/types/domain";

interface AppContextValue {
  session: Session | null;
  isReady: boolean;
  isAuthenticated: boolean;
  userContext: UserContext | null;
  visibleGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  refreshBootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

async function loadBootstrap(session: Session | null) {
  const [groups, classifications, speciesCatalog, userContext] = await Promise.all([
    listGroups(),
    listPointClassifications(),
    listSpecies(),
    getUserContext(session),
  ]);

  return {
    groups,
    classifications,
    speciesCatalog,
    userContext,
  };
}

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [visibleGroups, setVisibleGroups] = useState<GroupRecord[]>([]);
  const [classifications, setClassifications] = useState<PointClassificationRecord[]>([]);
  const [speciesCatalog, setSpeciesCatalog] = useState<SpeciesRecord[]>([]);

  async function refreshForSession(nextSession: Session | null) {
    const bootstrap = await loadBootstrap(nextSession);
    setVisibleGroups(bootstrap.groups);
    setClassifications(bootstrap.classifications);
    setSpeciesCatalog(bootstrap.speciesCatalog);
    setUserContext(bootstrap.userContext);
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const currentSession = await getCurrentSession();

        if (!isMounted) {
          return;
        }

        setSession(currentSession);
        await refreshForSession(currentSession);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void initialize();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refreshForSession(nextSession).finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      isReady,
      isAuthenticated: Boolean(session),
      userContext,
      visibleGroups,
      classifications,
      speciesCatalog,
      refreshBootstrap: async () => {
        setIsReady(false);

        try {
          const currentSession = await getCurrentSession();
          setSession(currentSession);
          await refreshForSession(currentSession);
        } finally {
          setIsReady(true);
        }
      },
      signIn: async (email: string, password: string) => {
        setIsReady(false);

        try {
          const nextSession = await signInWithPassword(email, password);
          setSession(nextSession);
          await refreshForSession(nextSession);
        } finally {
          setIsReady(true);
        }
      },
      signOut: async () => {
        setIsReady(false);

        try {
          await apiSignOut();
          setSession(null);
          await refreshForSession(null);
        } finally {
          setIsReady(true);
        }
      },
    }),
    [classifications, isReady, session, speciesCatalog, userContext, visibleGroups],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppContext must be used within AppProvider.");
  }

  return context;
}
