import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { appReducer } from "../core/app-reducer.js";
import { createDefaultState, type Task } from "../core/tasks.js";
import { getStateFilePath, loadState, saveState } from "../lib/storage.js";

type AppDomainStateValue = {
  appName: string;
  visitCount: number;
  tasks: Task[];
  storagePath: string;
  isHydrated: boolean;
};

type AppDomainActionsValue = {
  incrementVisitCount: () => void;
  addTask: (title: string) => void;
  toggleTaskDoneAt: (index: number) => void;
  deleteTaskAt: (index: number) => void;
};

const AppDomainStateContext = createContext<AppDomainStateValue | undefined>(
  undefined,
);

const AppDomainActionsContext = createContext<
  AppDomainActionsValue | undefined
>(undefined);

type AppDomainProviderProps = {
  children: ReactNode;
};

export function AppDomainProvider({ children }: AppDomainProviderProps) {
  const [domainState, dispatch] = useReducer(appReducer, createDefaultState());
  const [isHydrated, setIsHydrated] = useReducer(() => true, false);

  useEffect(() => {
    void (async () => {
      const persisted = await loadState();
      dispatch({ type: "hydrate", payload: persisted });
      setIsHydrated();
    })();
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void saveState(domainState);
  }, [domainState, isHydrated]);

  const incrementVisitCount = useCallback(() => {
    dispatch({ type: "increment_visit_count" });
  }, []);

  const addTask = useCallback((title: string) => {
    dispatch({ type: "add_task", title });
  }, []);

  const toggleTaskDoneAt = useCallback((index: number) => {
    dispatch({ type: "toggle_task_done", index });
  }, []);

  const deleteTaskAt = useCallback((index: number) => {
    dispatch({ type: "delete_task", index });
  }, []);

  const stateValue = useMemo<AppDomainStateValue>(
    () => ({
      appName: "Orqent",
      visitCount: domainState.visitCount,
      tasks: domainState.tasks,
      storagePath: getStateFilePath(),
      isHydrated,
    }),
    [domainState, isHydrated],
  );

  const actionsValue = useMemo<AppDomainActionsValue>(
    () => ({
      incrementVisitCount,
      addTask,
      toggleTaskDoneAt,
      deleteTaskAt,
    }),
    [incrementVisitCount, addTask, toggleTaskDoneAt, deleteTaskAt],
  );

  return (
    <AppDomainStateContext.Provider value={stateValue}>
      <AppDomainActionsContext.Provider value={actionsValue}>
        {children}
      </AppDomainActionsContext.Provider>
    </AppDomainStateContext.Provider>
  );
}

export function useAppDomainState() {
  const context = useContext(AppDomainStateContext);

  if (!context) {
    throw new Error(
      "useAppDomainState debe usarse dentro de AppDomainProvider",
    );
  }

  return context;
}

export function useAppDomainActions() {
  const context = useContext(AppDomainActionsContext);

  if (!context) {
    throw new Error(
      "useAppDomainActions debe usarse dentro de AppDomainProvider",
    );
  }

  return context;
}
