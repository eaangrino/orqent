import { describe, expect, it } from 'vitest';
import {
  createInitialTasksUiState,
  tasksUiReducer,
} from '../tasks-ui-reducer.js';

describe('tasksUiReducer', () => {
  it('abre el composer y limpia el draft', () => {
    const initial = {
      taskDraft: 'algo',
      isTaskComposerOpen: false,
      isTaskListFocused: true,
      selectedTaskIndex: 2,
    };

    const result = tasksUiReducer(initial, { type: 'open_task_composer' });

    expect(result).toEqual({
      taskDraft: '',
      isTaskComposerOpen: true,
      isTaskListFocused: false,
      selectedTaskIndex: 2,
    });
  });

  it('cierra el composer y limpia el draft', () => {
    const initial = {
      taskDraft: 'temporal',
      isTaskComposerOpen: true,
      isTaskListFocused: false,
      selectedTaskIndex: 0,
    };

    const result = tasksUiReducer(initial, { type: 'close_task_composer' });

    expect(result).toEqual({
      taskDraft: '',
      isTaskComposerOpen: false,
      isTaskListFocused: false,
      selectedTaskIndex: 0,
    });
  });

  it('actualiza el draft', () => {
    const initial = createInitialTasksUiState();

    const result = tasksUiReducer(initial, {
      type: 'set_task_draft',
      value: 'Nueva tarea',
    });

    expect(result.taskDraft).toBe('Nueva tarea');
  });

  it('enfoca la lista solo si hay tareas', () => {
    const initial = createInitialTasksUiState();

    const result = tasksUiReducer(initial, {
      type: 'focus_task_list',
      tasksLength: 3,
    });

    expect(result.isTaskListFocused).toBe(true);
    expect(result.isTaskComposerOpen).toBe(false);
  });

  it('no enfoca la lista si no hay tareas', () => {
    const initial = createInitialTasksUiState();

    const result = tasksUiReducer(initial, {
      type: 'focus_task_list',
      tasksLength: 0,
    });

    expect(result).toEqual(initial);
  });

  it('mueve la selección hacia abajo', () => {
    const initial = createInitialTasksUiState();

    const result = tasksUiReducer(initial, {
      type: 'move_task_selection',
      delta: 1,
      tasksLength: 3,
    });

    expect(result.selectedTaskIndex).toBe(1);
  });

  it('hace wrap al mover hacia arriba desde 0', () => {
    const initial = createInitialTasksUiState();

    const result = tasksUiReducer(initial, {
      type: 'move_task_selection',
      delta: -1,
      tasksLength: 3,
    });

    expect(result.selectedTaskIndex).toBe(2);
  });

  it('resetea selección y quita foco si ya no hay tareas', () => {
    const initial = {
      taskDraft: '',
      isTaskComposerOpen: false,
      isTaskListFocused: true,
      selectedTaskIndex: 2,
    };

    const result = tasksUiReducer(initial, {
      type: 'sync_selection_after_tasks_change',
      tasksLength: 0,
    });

    expect(result).toEqual({
      taskDraft: '',
      isTaskComposerOpen: false,
      isTaskListFocused: false,
      selectedTaskIndex: 0,
    });
  });

  it('recorta la selección si el total de tareas baja', () => {
    const initial = {
      taskDraft: '',
      isTaskComposerOpen: false,
      isTaskListFocused: true,
      selectedTaskIndex: 5,
    };

    const result = tasksUiReducer(initial, {
      type: 'sync_selection_after_tasks_change',
      tasksLength: 3,
    });

    expect(result.selectedTaskIndex).toBe(2);
    expect(result.isTaskListFocused).toBe(true);
  });
});