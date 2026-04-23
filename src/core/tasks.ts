export type Task = {
  id: number;
  title: string;
  done: boolean;
};

export type AppState = {
  visitCount: number;
  tasks: Task[];
};

export function createDefaultState(): AppState {
  return {
    visitCount: 0,
    tasks: [
      { id: 1, title: 'Preparar layout base', done: true },
      { id: 2, title: 'Conectar navegación', done: true },
      { id: 3, title: 'Crear estado de tareas', done: false },
    ],
  };
}

export function addTask(tasks: Task[], title: string): Task[] {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return tasks;
  }

  const nextId = tasks.length > 0 ? tasks[ tasks.length - 1 ]!.id + 1 : 1;

  return [
    ...tasks,
    {
      id: nextId,
      title: normalizedTitle,
      done: false,
    },
  ];
}

export function toggleTaskDone(tasks: Task[], index: number): Task[] {
  if (index < 0 || index >= tasks.length) {
    return tasks;
  }

  return tasks.map((task, taskIndex) =>
    taskIndex === index ? { ...task, done: !task.done } : task,
  );
}

export function deleteTask(tasks: Task[], index: number): Task[] {
  if (index < 0 || index >= tasks.length) {
    return tasks;
  }

  return tasks.filter((_, taskIndex) => taskIndex !== index);
}