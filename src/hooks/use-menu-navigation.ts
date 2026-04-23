import { useApp, useInput } from 'ink';
import { useReducer } from 'react';
import {
  createInitialMenuNavigationState,
  menuNavigationReducer,
} from '../state/menu-navigation-reducer.js';
import { useTasksUiStateContext } from '../state/tasks-ui-context.js';

export function useMenuNavigation() {
  const { exit } = useApp();
  const { isTaskComposerOpen, isTaskListFocused } = useTasksUiStateContext();
  const [ state, dispatch ] = useReducer(
    menuNavigationReducer,
    undefined,
    createInitialMenuNavigationState,
  );

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    if (isTaskComposerOpen || isTaskListFocused) {
      return;
    }

    if (key.escape) {
      exit();
      return;
    }

    if (key.upArrow || input === 'k') {
      dispatch({ type: 'move_up' });
      return;
    }

    if (key.downArrow || input === 'j') {
      dispatch({ type: 'move_down' });
      return;
    }

    if (key.return) {
      dispatch({ type: 'activate_selected' });
    }
  });

  return {
    selectedIndex: state.selectedIndex,
    activeScreen: state.activeScreen,
  };
}