import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireRecord } from "../../src/shared/validation";

const executeFile = promisify(execFile);
const activationScript = `
ObjC.import("AppKit");
function run(argv) {
  const application = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]));
  if (!application.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) {
    throw new Error("Could not activate the isolated macOS test browser process.");
  }
}
`;

interface FocusServices {
  platform?: NodeJS.Platform;
  execute?: (file: string, args: string[], options: { timeout: number }) => Promise<void>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function validProcessId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 0x7fff_ffff;
}

export function browserProcessId(value: unknown): number {
  const info = requireRecord(value, "Browser process information");
  if (!Array.isArray(info.processInfo)) throw new Error("Browser process information must contain a process list.");
  const browsers = info.processInfo.map((entry) => requireRecord(entry, "Browser process"))
    .filter((entry) => entry.type === "browser");
  const id = browsers[0]?.id;
  if (browsers.length !== 1 || !validProcessId(id)) {
    throw new Error("Expected one valid isolated browser process ID.");
  }
  return id;
}

export async function focusNativeTestWindow(
  processId: number | undefined,
  readFocused: () => Promise<boolean>,
  services: FocusServices = {}
): Promise<void> {
  if ((services.platform ?? process.platform) !== "darwin") return;
  if (!validProcessId(processId)) throw new Error("A valid isolated macOS browser process ID is required.");
  const execute = services.execute ?? (async (file, args, options) => { await executeFile(file, args, options); });
  await execute("osascript", ["-l", "JavaScript", "-e", activationScript, String(processId)], { timeout: 10_000 });
  const now = services.now ?? Date.now;
  const sleep = services.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + 10_000;
  while (now() < deadline) {
    if (await readFocused()) return;
    await sleep(100);
  }
  throw new Error("The isolated macOS Code window did not acquire real document focus. Focus emulation is not used.");
}
