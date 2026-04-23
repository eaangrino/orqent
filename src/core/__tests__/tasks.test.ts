import { describe, expect, it } from 'vitest';
import { addTask, createDefaultState, deleteTask, toggleTaskDone } from '../tasks.js';

function makeTasks() {
  return createDefaultState().tasks;
}

describe('addTask', () => {
  it('agrega una nueva tarea al final', () => {
    const tasks = makeTasks();

    const result = addTask(tasks, 'Nueva tarea');

    expect(result).toHaveLength(tasks.length + 1);
    expect(result.at(-1)).toEqual({
      id: 4,
      title: 'Nueva tarea',
      done: false,
    });
  });

  it('hace trim al título antes de agregar', () => {
    const tasks = makeTasks();

    const result = addTask(tasks, '   Tarea con espacios   ');

    expect(result.at(-1)).toEqual({
      id: 4,
      title: 'Tarea con espacios',
      done: false,
    });
  });

  it('no agrega nada si el título queda vacío', () => {
    const tasks = makeTasks();

    const result = addTask(tasks, '     ');

    expect(result).toEqual(tasks);
  });

  it('asigna id 1 cuando no existen tareas previas', () => {
    const result = addTask([], 'Primera tarea');

    expect(result).toEqual([
      {
        id: 1,
        title: 'Primera tarea',
        done: false,
      },
    ]);
  });
});

describe('toggleTaskDone', () => {
  it('marca una tarea pendiente como completada', () => {
    const tasks = makeTasks();

    const result = toggleTaskDone(tasks, 2);

    expect(result[ 2 ]).toEqual({
      id: 3,
      title: 'Crear estado de tareas',
      done: true,
    });
  });

  it('vuelve a pendiente una tarea completada', () => {
    const tasks = makeTasks();

    const result = toggleTaskDone(tasks, 0);

    expect(result[ 0 ]).toEqual({
      id: 1,
      title: 'Preparar layout base',
      done: false,
    });
  });

  it('no cambia nada si el índice es inválido', () => {
    const tasks = makeTasks();

    expect(toggleTaskDone(tasks, -1)).toEqual(tasks);
    expect(toggleTaskDone(tasks, 999)).toEqual(tasks);
  });
});

describe('deleteTask', () => {
  it('elimina una tarea intermedia', () => {
    const tasks = makeTasks();

    const result = deleteTask(tasks, 1);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 1, title: 'Preparar layout base', done: true },
      { id: 3, title: 'Crear estado de tareas', done: false },
    ]);
  });

  it('elimina la primera tarea', () => {
    const tasks = makeTasks();

    const result = deleteTask(tasks, 0);

    expect(result).toHaveLength(2);
    expect(result[ 0 ]).toEqual({
      id: 2,
      title: 'Conectar navegación',
      done: true,
    });
  });

  it('no cambia nada si el índice es inválido', () => {
    const tasks = makeTasks();

    expect(deleteTask(tasks, -1)).toEqual(tasks);
    expect(deleteTask(tasks, 999)).toEqual(tasks);
  });
});