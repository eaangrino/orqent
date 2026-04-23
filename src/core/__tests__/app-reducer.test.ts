import { describe, expect, it } from 'vitest';
import { appReducer } from '../app-reducer.js';
import { createDefaultState } from '../tasks.js';

describe('appReducer', () => {
  it('hidrata el estado', () => {
    const initial = createDefaultState();

    const result = appReducer(initial, {
      type: 'hydrate',
      payload: {
        visitCount: 9,
        tasks: [ { id: 1, title: 'X', done: false } ],
      },
    });

    expect(result).toEqual({
      visitCount: 9,
      tasks: [ { id: 1, title: 'X', done: false } ],
    });
  });

  it('incrementa el contador global', () => {
    const initial = createDefaultState();

    const result = appReducer(initial, { type: 'increment_visit_count' });

    expect(result.visitCount).toBe(1);
  });

  it('agrega una tarea', () => {
    const initial = createDefaultState();

    const result = appReducer(initial, {
      type: 'add_task',
      title: 'Nueva tarea',
    });

    expect(result.tasks.at(-1)).toEqual({
      id: 4,
      title: 'Nueva tarea',
      done: false,
    });
  });

  it('togglea una tarea', () => {
    const initial = createDefaultState();

    const result = appReducer(initial, {
      type: 'toggle_task_done',
      index: 2,
    });

    expect(result.tasks[ 2 ]?.done).toBe(true);
  });

  it('elimina una tarea', () => {
    const initial = createDefaultState();

    const result = appReducer(initial, {
      type: 'delete_task',
      index: 1,
    });

    expect(result.tasks).toEqual([
      { id: 1, title: 'Preparar layout base', done: true },
      { id: 3, title: 'Crear estado de tareas', done: false },
    ]);
  });

  it('resetea al estado por defecto', () => {
    const initial = {
      visitCount: 77,
      tasks: [ { id: 1, title: 'Temporal', done: false } ],
    };

    const result = appReducer(initial, { type: 'reset_state' });

    expect(result).toEqual(createDefaultState());
  });
});