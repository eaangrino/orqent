import { type ReactNode } from "react";
import { AppDomainProvider } from "./app-domain-context.js";
import { TasksUiProvider } from "./tasks-ui-context.js";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AppDomainProvider>
      <TasksUiProvider>{children}</TasksUiProvider>
    </AppDomainProvider>
  );
}
