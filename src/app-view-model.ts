import { screens, type ScreenKey } from './screens/index.js';

type AppViewModelArgs = {
  activeScreen: ScreenKey;
  isTaskComposerOpen: boolean;
  isTaskListFocused: boolean;
};

export function getAppViewModel({
  activeScreen,
  isTaskComposerOpen,
  isTaskListFocused,
}: AppViewModelArgs) {
  const instructions =
    activeScreen === 'tasks' && isTaskComposerOpen
      ? 'Escribe el título. Enter guarda. Esc cancela.'
      : activeScreen === 'tasks' && isTaskListFocused
        ? 'Lista enfocada: ↑/↓ o j/k mover, x completar, d eliminar, Esc salir.'
        : 'Usa ↑/↓ o j/k para moverte. Enter para seleccionar.';

  const footerHelp =
    activeScreen === 'tasks' && isTaskComposerOpen
      ? [ 'q salir', 'Enter guardar', 'Esc cancelar' ]
      : activeScreen === 'tasks' && isTaskListFocused
        ? [ 'q salir', '↑/↓ o j/k mover', 'x completar', 'd eliminar', 'Esc salir lista' ]
        : screens[ activeScreen ].shortcuts;

  return {
    instructions,
    footerHelp,
  };
}