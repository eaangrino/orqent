import { useInput } from 'ink';
import { type ScreenKey } from '../screens/index.js';
import { useAppDomainActions } from '../state/app-domain-context.js';
import {
  useTasksUiActions,
  useTasksUiStateContext,
} from '../state/tasks-ui-context.js';

export function useScreenShortcuts(activeScreen: ScreenKey) {
  const { incrementVisitCount } = useAppDomainActions();
  const { openTaskComposer, focusTaskList } = useTasksUiActions();
  const { isTaskComposerOpen, isTaskListFocused } = useTasksUiStateContext();

  useInput((input, key) => {
    if (isTaskComposerOpen || isTaskListFocused) {
      return;
    }

    if (
      key.upArrow ||
      key.downArrow ||
      key.return ||
      key.escape ||
      input === 'q' ||
      input === 'j' ||
      input === 'k'
    ) {
      return;
    }

    switch (activeScreen) {
      case 'dashboard':
        if (input === '+') {
          incrementVisitCount();
        }
        return;

      case 'tasks':
        if (input === 'n') {
          openTaskComposer();
          return;
        }

        if (input === 'f') {
          focusTaskList();
        }
        return;

      case 'settings':
      default:
        return;
    }
  });
}