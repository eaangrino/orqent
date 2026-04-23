import { DashboardScreen } from "./dashboard.js";
import { TasksScreen } from "./tasks.js";
import { SettingsScreen } from "./settings.js";

export const screens = {
  dashboard: {
    label: "Dashboard",
    component: DashboardScreen,
    shortcuts: [
      "q salir",
      "Enter seleccionar",
      "j/k o ↑/↓ navegar",
      "+ incrementar contador",
    ],
  },
  tasks: {
    label: "Tareas",
    component: TasksScreen,
    shortcuts: [
      "q salir",
      "Enter seleccionar",
      "j/k o ↑/↓ navegar",
      "n nueva tarea",
      "f enfocar lista",
    ],
  },
  settings: {
    label: "Configuración",
    component: SettingsScreen,
    shortcuts: ["q salir", "Enter seleccionar", "j/k o ↑/↓ navegar"],
  },
} as const;

export type ScreenKey = keyof typeof screens;

export const screenOrder: ScreenKey[] = ["dashboard", "tasks", "settings"];
