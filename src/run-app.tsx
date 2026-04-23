import { render } from "ink";
import { App } from "./app.js";
import { AppProviders } from "./state/app-providers.js";

export function runApp() {
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}
