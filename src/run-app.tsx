import { render } from "ink";
import { App } from "./app.js";

export function runApp() {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  }

  render(<App />);
}
