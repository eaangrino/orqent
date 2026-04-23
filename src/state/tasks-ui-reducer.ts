export type TasksUiState = {
  taskDraft: string;
  isTaskComposerOpen: boolean;
  isTaskListFocused: boolean;
  selectedTaskIndex: number;
};

export type TasksUiAction =
  | { type: 'set_task_draft'; value: string }
  | { type: 'open_task_composer' }
  | { type: 'close_task_composer' }
  | { type: 'submit_task_draft' }
  | { type: 'focus_task_list'; tasksLength: number }
  | { type: 'blur_task_list' }
  | { type: 'move_task_selection'; delta: number; tasksLength: number }
  | { type: 'sync_selection_after_tasks_change'; tasksLength: number };

export function createInitialTasksUiState(): TasksUiState {
  return {
    taskDraft: '',
    isTaskComposerOpen: false,
    isTaskListFocused: false,
    selectedTaskIndex: 0,
  };
}

export function tasksUiReducer(state: TasksUiState, action: TasksUiAction): TasksUiState {
  switch (action.type) {
    case 'set_task_draft':
      return {
        ...state,
        taskDraft: action.value,
      };

    case 'open_task_composer':
      return {
        ...state,
        taskDraft: '',
        isTaskComposerOpen: true,
        isTaskListFocused: false,
      };

    case 'close_task_composer':
      return {
        ...state,
        taskDraft: '',
        isTaskComposerOpen: false,
      };

    case 'submit_task_draft':
      return {
        ...state,
        taskDraft: '',
        isTaskComposerOpen: false,
      };

    case 'focus_task_list':
      if (action.tasksLength === 0) {
        return state;
      }

      return {
        ...state,
        isTaskComposerOpen: false,
        isTaskListFocused: true,
      };

    case 'blur_task_list':
      return {
        ...state,
        isTaskListFocused: false,
      };

    case 'move_task_selection': {
      if (action.tasksLength === 0) {
        return {
          ...state,
          selectedTaskIndex: 0,
        };
      }

      const next = state.selectedTaskIndex + action.delta;

      return {
        ...state,
        selectedTaskIndex:
          next < 0 ? action.tasksLength - 1 : next >= action.tasksLength ? 0 : next,
      };
    }

    case 'sync_selection_after_tasks_change':
      if (action.tasksLength === 0) {
        return {
          ...state,
          selectedTaskIndex: 0,
          isTaskListFocused: false,
        };
      }

      return {
        ...state,
        selectedTaskIndex: Math.min(state.selectedTaskIndex, action.tasksLength - 1),
      };

    default: {
      /* v8 ignore next 2 */
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}