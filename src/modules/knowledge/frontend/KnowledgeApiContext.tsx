import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { createKnowledgeApi, type KnowledgeApi } from "./hooks/useKnowledgeApi";

interface KnowledgeApiContextValue {
  api: KnowledgeApi;
}

const KnowledgeApiContext = createContext<KnowledgeApiContextValue | null>(
  null,
);

export function KnowledgeApiProvider({
  backendURL,
  moduleId,
  children,
}: {
  backendURL: string | null;
  moduleId: string;
  children: ReactNode;
}) {
  const api = useMemo(
    () => createKnowledgeApi(backendURL, moduleId),
    [backendURL, moduleId],
  );

  return (
    <KnowledgeApiContext.Provider value={{ api }}>
      {children}
    </KnowledgeApiContext.Provider>
  );
}

export function useKnowledgeApi(): KnowledgeApi {
  const context = useContext(KnowledgeApiContext);
  if (!context) {
    throw new Error(
      "useKnowledgeApi must be used within KnowledgeApiProvider",
    );
  }
  return context.api;
}
