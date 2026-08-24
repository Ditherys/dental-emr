import { parseSupabaseQueryResult } from "./remote-database-test-guard.mjs";

export function runGuardedSupabaseCommands({
  commandName,
  commands,
  sentinel,
  execute,
  parse = parseSupabaseQueryResult,
}) {
  for (const [index, command] of commands.entries()) {
    const capturesSentinel = Boolean(sentinel) && index === commands.length - 1;
    const result = execute(command, capturesSentinel);

    if (result.error) {
      return { error: "The pinned Supabase CLI could not start." };
    }

    if (result.status !== 0) {
      return { exitCode: result.status ?? 1 };
    }

    if (capturesSentinel) {
      parse(result.stdout ?? "", commandName, sentinel);
    }
  }

  return { exitCode: 0 };
}
