import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  useAppDomainActions,
  useAppDomainState,
} from "./app-domain-context.js";
import {
  createInitialTasksUiState,
  tasksUiReducer,
} from "./tasks-ui-reducer.js";

type TasksUiStateValue = {
  taskDraft: string;
  isTaskComposerOpen: boolean;
  isTaskListFocused: boolean;
  selectedTaskIndex: number;
};

type TasksUiActionsValue = {
  setTaskDraft: (value: string) => void;
  openTaskComposer: () => void;
  closeTaskComposer: () => void;
  submitTaskDraft: () => void;
  focusTaskList: () => void;
  blurTaskList: () => void;
  moveTaskSelection: (delta: number) => void;
  toggleSelectedTaskDone: () => void;
  deleteSelectedTask: () => void;
};

const TasksUiStateContext = createContext<TasksUiStateValue | undefined>(
  undefined,
);
const TasksUiActionsContext = createContext<TasksUiActionsValue | undefined>(
  undefined,
);

type TasksUiProviderProps = {
  children: ReactNode;
};

export function TasksUiProvider({ children }: TasksUiProviderProps) {
  const { tasks } = useAppDomainState();
  const { addTask, toggleTaskDoneAt, deleteTaskAt } = useAppDomainActions();

  const [state, dispatch] = useReducer(
    tasksUiReducer,
    undefined,
    createInitialTasksUiState,
  );

  useEffect(() => {
    dispatch({
      type: "sync_selection_after_tasks_change",
      tasksLength: tasks.length,
    });
  }, [tasks.length]);

  const stateValue = useMemo<TasksUiStateValue>(
    () => ({
      taskDraft: state.taskDraft,
      isTaskComposerOpen: state.isTaskComposerOpen,
      isTaskListFocused: state.isTaskListFocused,
      selectedTaskIndex: state.selectedTaskIndex,
    }),
    [
      state.taskDraft,
      state.isTaskComposerOpen,
      state.isTaskListFocused,
      state.selectedTaskIndex,
    ],
  );

  const actionsValue = useMemo<TasksUiActionsValue>(
    () => ({
      setTaskDraft: (value: string) => {
        dispatch({ type: "set_task_draft", value });
      },
      openTaskComposer: () => {
        dispatch({ type: "open_task_composer" });
      },
      closeTaskComposer: () => {
        dispatch({ type: "close_task_composer" });
      },
      submitTaskDraft: () => {
        const normalizedTitle = state.taskDraft.trim();

        if (normalizedTitle) {
          addTask(normalizedTitle);
        }

        dispatch({ type: "submit_task_draft" });
      },
      focusTaskList: () => {
        dispatch({ type: "focus_task_list", tasksLength: tasks.length });
      },
      blurTaskList: () => {
        dispatch({ type: "blur_task_list" });
      },
      moveTaskSelection: (delta: number) => {
        dispatch({
          type: "move_task_selection",
          delta,
          tasksLength: tasks.length,
        });
      },
      toggleSelectedTaskDone: () => {
        if (tasks.length === 0) {
          return;
        }

        const index = Math.min(state.selectedTaskIndex, tasks.length - 1);
        toggleTaskDoneAt(index);
      },
      deleteSelectedTask: () => {
        if (tasks.length === 0) {
          return;
        }

        const index = Math.min(state.selectedTaskIndex, tasks.length - 1);
        deleteTaskAt(index);
      },
    }),
    [
      state.taskDraft,
      state.selectedTaskIndex,
      tasks.length,
      addTask,
      toggleTaskDoneAt,
      deleteTaskAt,
    ],
  );

  return (
    <TasksUiStateContext.Provider value={stateValue}>
      <TasksUiActionsContext.Provider value={actionsValue}>
        {children}
      </TasksUiActionsContext.Provider>
    </TasksUiStateContext.Provider>
  );
}

export function useTasksUiStateContext() {
  const context = useContext(TasksUiStateContext);

  if (!context) {
    throw new Error(
      "useTasksUiStateContext debe usarse dentro de TasksUiProvider",
    );
  }

  return context;
}

export function useTasksUiActions() {
  const context = useContext(TasksUiActionsContext);

  if (!context) {
    throw new Error("useTasksUiActions debe usarse dentro de TasksUiProvider");
  }

  return context;
}
