export function isClaudeGenerated(perfume) {
  const provider = perfume?.info?.contentGeneration?.provider;
  return typeof provider === "string" && provider.trim().toLowerCase() === "claude";
}
