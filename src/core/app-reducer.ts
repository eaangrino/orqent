import {
  addTask,
  createDefaultState,
  deleteTask,
  toggleTaskDone,
  type AppState,
} from './tasks.js';

export type AppAction =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'increment_visit_count' }
  | { type: 'add_task'; title: string }
  | { type: 'toggle_task_done'; index: number }
  | { type: 'delete_task'; index: number }
  | { type: 'reset_state' };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;

    case 'increment_visit_count':
      return {
        ...state,
        visitCount: state.visitCount + 1,
      };

    case 'add_task':
      return {
        ...state,
        tasks: addTask(state.tasks, action.title),
      };

    case 'toggle_task_done':
      return {
        ...state,
        tasks: toggleTaskDone(state.tasks, action.index),
      };

    case 'delete_task':
      return {
        ...state,
        tasks: deleteTask(state.tasks, action.index),
      };

    case 'reset_state':
      return createDefaultState();

    default: {
      /* v8 ignore next 2 */
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}