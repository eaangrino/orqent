import { Layout } from "./components/layout.js";
import { getAppViewModel } from "./app-view-model.js";
import { useMenuNavigation } from "./hooks/use-menu-navigation.js";
import { useScreenShortcuts } from "./hooks/use-screen-shortcuts.js";
import { screens } from "./screens/index.js";
import { useTasksUiStateContext } from "./state/tasks-ui-context.js";

export function App() {
  const { selectedIndex, activeScreen } = useMenuNavigation();
  const { isTaskComposerOpen, isTaskListFocused } = useTasksUiStateContext();

  useScreenShortcuts(activeScreen);

  const menuItems = Object.values(screens).map((screen) => screen.label);
  const ActiveComponent = screens[activeScreen].component;

  const { instructions, footerHelp } = getAppViewModel({
    activeScreen,
    isTaskComposerOpen,
    isTaskListFocused,
  });

  return (
    <Layout
      title="Orqent"
      instructions={instructions}
      menuItems={menuItems}
      selectedIndex={selectedIndex}
      activeLabel={screens[activeScreen].label}
      footerHelp={footerHelp}>
      <ActiveComponent />
    </Layout>
  );
}
