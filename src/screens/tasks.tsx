import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppDomainState } from "../state/app-domain-context.js";
import {
  useTasksUiActions,
  useTasksUiStateContext,
} from "../state/tasks-ui-context.js";

export function TasksScreen() {
  const { tasks } = useAppDomainState();
  const {
    taskDraft,
    isTaskComposerOpen,
    isTaskListFocused,
    selectedTaskIndex,
  } = useTasksUiStateContext();
  const {
    setTaskDraft,
    closeTaskComposer,
    submitTaskDraft,
    blurTaskList,
    moveTaskSelection,
    toggleSelectedTaskDone,
    deleteSelectedTask,
  } = useTasksUiActions();

  useInput((input, key) => {
    if (isTaskComposerOpen) {
      if (key.escape || input === "\u0003") {
        closeTaskComposer();
      }

      return;
    }

    if (!isTaskListFocused) {
      return;
    }

    if (key.escape) {
      blurTaskList();
      return;
    }

    if (key.upArrow || input === "k") {
      moveTaskSelection(-1);
      return;
    }

    if (key.downArrow || input === "j") {
      moveTaskSelection(1);
      return;
    }

    if (input === "x" || input === " ") {
      toggleSelectedTaskDone();
      return;
    }

    if (input === "d") {
      deleteSelectedTask();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">Tareas</Text>

      {tasks.length === 0 ? (
        <Text>No hay tareas.</Text>
      ) : (
        tasks.map((task, index) => {
          const isSelected = isTaskListFocused && index === selectedTaskIndex;

          return (
            <Text key={task.id} color={isSelected ? "cyan" : undefined}>
              {isSelected ? "❯ " : "  "}
              {task.done ? "✔" : "•"} {task.title}
            </Text>
          );
        })
      )}

      <Box marginTop={1} flexDirection="column">
        {!isTaskComposerOpen && !isTaskListFocused ? (
          <Text dimColor>
            Presiona n para crear una tarea o f para enfocar la lista.
          </Text>
        ) : null}

        {!isTaskComposerOpen && isTaskListFocused ? (
          <Text dimColor>
            x completar • d eliminar • Esc salir del foco de lista
          </Text>
        ) : null}

        {isTaskComposerOpen ? (
          <>
            <Box>
              <Box marginRight={1}>
                <Text>Nueva tarea:</Text>
              </Box>

              <TextInput
                value={taskDraft}
                onChange={setTaskDraft}
                onSubmit={submitTaskDraft}
                placeholder="Escribe el título y presiona Enter"
                focus={isTaskComposerOpen}
                showCursor
              />
            </Box>

            <Text dimColor>Enter guardar • Esc cancelar</Text>
          </>
        ) : null}
      </Box>
    </Box>
  );
}
