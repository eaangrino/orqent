import { render } from "ink";
import { App } from "./app.js";

export type RunAppOptions = {
  resumeSessionId?: string;
};

export function runApp(options: RunAppOptions = {}) {
  let activeSessionId = options.resumeSessionId ?? null;
  let isExiting = false;

  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  }

  const exitOrqent = () => {
    if (isExiting) {
      return;
    }

    isExiting = true;
    instance.unmount();

    if (activeSessionId) {
      console.log(
        `\nFor resuming this conversation: orqent resume ${activeSessionId}`,
      );
    }

    process.exit(0);
  };

  const instance = render(
    <App
      resumeSessionId={options.resumeSessionId}
      onSessionReady={(sessionId) => {
        activeSessionId = sessionId;
      }}
      onExit={exitOrqent}
    />,
    {
      exitOnCtrlC: false,
    },
  );
}
