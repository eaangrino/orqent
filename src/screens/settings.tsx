import { Box, Text } from "ink";
import { useAppDomainState } from "../state/app-domain-context.js";

export function SettingsScreen() {
  const { storagePath, isHydrated } = useAppDomainState();

  return (
    <Box flexDirection="column">
      <Text color="yellow">Configuración</Text>
      <Text>Persistencia: {isHydrated ? "activa" : "cargando"}</Text>
      <Text>Archivo de estado: {storagePath}</Text>
    </Box>
  );
}
