import { Box, Text } from "ink";
import { useAppDomainState } from "../state/app-domain-context.js";

export function DashboardScreen() {
  const { appName, visitCount, tasks } = useAppDomainState();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.done).length;
  const pendingTasks = totalTasks - completedTasks;

  return (
    <Box flexDirection="column">
      <Text color="yellow">Dashboard</Text>
      <Text>Aplicación: {appName}</Text>
      <Text>Contador global: {visitCount}</Text>
      <Text>Total tareas: {totalTasks}</Text>
      <Text>Tareas pendientes: {pendingTasks}</Text>
      <Text>Tareas completadas: {completedTasks}</Text>
      <Text dimColor>Presiona + para incrementar el contador global.</Text>
    </Box>
  );
}
