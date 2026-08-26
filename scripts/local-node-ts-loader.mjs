const serverOnlyStubUrl = new URL(
  "../src/test/server-only-stub.ts",
  import.meta.url,
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: serverOnlyStubUrl, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") || !context.parentURL?.startsWith("file:")) {
      throw error;
    }

    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next extension candidate.
      }
    }

    throw error;
  }
}
