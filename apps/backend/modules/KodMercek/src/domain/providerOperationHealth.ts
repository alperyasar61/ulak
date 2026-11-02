export type HopperProcessProviderState = "busy" | "not_started" | "unreachable" | "exited" | "unknown";
export type ProviderFailureStage = "connection" | "decompilation" | "analysis" | "launch";

export const providerRetryAction = (
  state: string,
  startupFailure?: boolean,
): "restart_provider" | "wait" | "manual" => {
  if (state === "unreachable" || state === "exited") return "restart_provider";
  if (state === "busy") return "wait";
  if (startupFailure) return "manual";
  return "manual";
};
