import { screenOrder, type ScreenKey } from '../screens/index.js';

export type MenuNavigationState = {
  selectedIndex: number;
  activeScreen: ScreenKey;
};

export type MenuNavigationAction =
  | { type: 'move_up' }
  | { type: 'move_down' }
  | { type: 'activate_selected' };

export function createInitialMenuNavigationState(): MenuNavigationState {
  return {
    selectedIndex: 0,
    activeScreen: screenOrder[ 0 ],
  };
}

export function menuNavigationReducer(
  state: MenuNavigationState,
  action: MenuNavigationAction,
): MenuNavigationState {
  switch (action.type) {
    case 'move_up':
      return {
        ...state,
        selectedIndex:
          state.selectedIndex <= 0 ? screenOrder.length - 1 : state.selectedIndex - 1,
      };

    case 'move_down':
      return {
        ...state,
        selectedIndex:
          state.selectedIndex >= screenOrder.length - 1 ? 0 : state.selectedIndex + 1,
      };

    case 'activate_selected':
      return {
        ...state,
        activeScreen: screenOrder[ state.selectedIndex ],
      };

    default: {
      /* v8 ignore next 2 */
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}