import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import {
  clientRegistrationEntry,
  effectiveClientServer,
  parseClientConfiguration,
  serializeClientConfiguration,
} from "../../../src/application/ClientConfigurationDocument.js";
import {
  clientConfigurationAligned,
  configureClientConfiguration,
  inspectClientConfiguration,
} from "../../../src/application/SetupClientConfiguration.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { readClientRegistrationStatuses } from "../../../src/application/ClientRegistrationStatus.js";

it.each([
  ["cursor", "json", "mcpServers", "env"],
  ["codex", "toml", "mcp_servers", "env"],
  ["opencode", "opencode", "mcp", "environment"],
  ["hermes", "hermes", "mcp_servers", "env"],
] as const)(
  "preserves %s server environment through command and provider updates",
  async (name, format, serversKey, environmentKey) => {
    const root = await createTestTempDirectory("KodMercek-setup-environment-");
    const configPath = join(root, "config");
    const client = { name, format, configPath };
    const custom = {
      REA_MCP_INPUT_SCHEMA_PROFILE: "compact",
      REA_MCP_OUTPUT_SCHEMA_PROFILE: "off",
      REA_MCP_MAX_RESPONSE_BYTES: "33554432",
      REA_BROWSER_EXECUTABLE: join(root, "custom-browser"),
      GHIDRA_INSTALL_DIR: join(root, "old-ghidra"),
      HOPPER_LOADER_ARGS_JSON: '["", "--loader", "Mach-O"]',
      REA_REFERENCE_SECRET_PATTERNS_JSON: '["*.private", "local/**"]',
      REA_GHIDRA_LANGUAGE_ID: "x86:LE:32:default",
      REA_GHIDRA_COMPILER_SPEC_ID: "borlandcpp",
      CALLER_SETTING: "preserve exactly",
    };
    const original = serializeClientConfiguration(
      {
        [serversKey]: {
          KodMercek: clientRegistrationEntry(format, ["KodMercek-old", "mcp"], custom),
          other: clientRegistrationEntry(format, ["other"], { OTHER: "keep" }),
        },
      },
      format,
    );
    await writeFile(configPath, original);
    const providers = { GHIDRA_INSTALL_DIR: join(root, "new-ghidra") };
    const command = ["KodMercek", "mcp"];
    expect(
      await inspectClientConfiguration(client, providers, command),
    ).toMatchObject({ status: "update" });
    expect(
      await configureClientConfiguration(client, providers, command),
    ).toMatchObject({ status: "configured" });
    const configured = await readFile(configPath, "utf8");
    const parsed = parseClientConfiguration(configured, format);
    expect(effectiveClientServer(parsed, "KodMercek")).toHaveProperty(
      environmentKey,
      { ...custom, ...providers },
    );
    expect(effectiveClientServer(parsed, "other")).toEqual(
      effectiveClientServer(
        parseClientConfiguration(original, format),
        "other",
      ),
    );
    expect(await readFile(`${configPath}.KodMercek.backup`, "utf8")).toBe(original);
    expect(await clientConfigurationAligned(client, providers, command)).toBe(
      true,
    );
    expect(
      await inspectClientConfiguration(client, providers, command),
    ).toEqual({ status: "already_current" });
    expect(
      await configureClientConfiguration(client, providers, command),
    ).toEqual({ status: "unchanged" });
    expect(await readFile(configPath, "utf8")).toBe(configured);
  },
);

it("retains legacy OpenCode environment when migrating into a native server table", async () => {
  const root = await createTestTempDirectory("KodMercek-opencode-environment-");
  const configPath = join(root, "opencode.json");
  const client = { name: "opencode", format: "opencode", configPath } as const;
  const custom = { REA_MCP_INPUT_SCHEMA_PROFILE: "compact" };
  await writeFile(
    configPath,
    JSON.stringify({
      mcp: {
        KodMercek: clientRegistrationEntry("opencode", ["old", "mcp"], custom),
        servers: {
          other: clientRegistrationEntry("opencode_v2", ["other"], {}),
        },
      },
    }),
  );
  expect(
    await configureClientConfiguration(client, {}, ["KodMercek", "mcp"]),
  ).toMatchObject({ status: "configured" });
  const parsed = parseClientConfiguration(
    await readFile(configPath, "utf8"),
    "opencode",
  );
  expect(parsed.legacyServers).toEqual({});
  expect(parsed.servers.KodMercek).toEqual(
    clientRegistrationEntry("opencode_v2", ["KodMercek", "mcp"], custom),
  );
  expect(
    await configureClientConfiguration(client, {}, ["KodMercek", "mcp"]),
  ).toEqual({ status: "unchanged" });
});

it.each([
  [
    "non-string member",
    { REA_MCP_INPUT_SCHEMA_PROFILE: "compact", PORT: 8080 },
    "env.PORT",
  ],
  [
    "boolean member",
    { REA_MCP_INPUT_SCHEMA_PROFILE: "compact", FLAG: true },
    "env.FLAG",
  ],
  [
    "null member",
    { REA_MCP_INPUT_SCHEMA_PROFILE: "compact", VALUE: null },
    "env.VALUE",
  ],
  ["array", [], "env"],
  ["string", "not-a-map", "env"],
  ["null map", null, "env"],
  [
    "empty profile",
    { REA_MCP_INPUT_SCHEMA_PROFILE: "" },
    "REA_MCP_INPUT_SCHEMA_PROFILE",
  ],
  [
    "invalid profile",
    { REA_MCP_INPUT_SCHEMA_PROFILE: "bogus" },
    "REA_MCP_INPUT_SCHEMA_PROFILE",
  ],
  [
    "empty output profile",
    { REA_MCP_OUTPUT_SCHEMA_PROFILE: "" },
    "REA_MCP_OUTPUT_SCHEMA_PROFILE",
  ],
  [
    "invalid output profile",
    { REA_MCP_OUTPUT_SCHEMA_PROFILE: "bogus" },
    "REA_MCP_OUTPUT_SCHEMA_PROFILE",
  ],
  [
    "invalid response budget",
    { REA_MCP_MAX_RESPONSE_BYTES: "1" },
    "REA_MCP_MAX_RESPONSE_BYTES",
  ],
  [
    "malformed loader JSON",
    { HOPPER_LOADER_ARGS_JSON: "{" },
    "HOPPER_LOADER_ARGS_JSON",
  ],
  [
    "non-array loader JSON",
    { HOPPER_LOADER_ARGS_JSON: "{}" },
    "HOPPER_LOADER_ARGS_JSON",
  ],
  [
    "NUL loader argument",
    { HOPPER_LOADER_ARGS_JSON: JSON.stringify(["a\0b"]) },
    "HOPPER_LOADER_ARGS_JSON",
  ],
  [
    "malformed exclusion JSON",
    { REA_REFERENCE_SECRET_PATTERNS_JSON: "{" },
    "REA_REFERENCE_SECRET_PATTERNS_JSON",
  ],
  [
    "empty exclusion pattern",
    { REA_REFERENCE_SECRET_PATTERNS_JSON: '[""]' },
    "REA_REFERENCE_SECRET_PATTERNS_JSON",
  ],
  [
    "unpaired compiler specification",
    { REA_GHIDRA_COMPILER_SPEC_ID: "borlandcpp" },
    "REA_GHIDRA_COMPILER_SPEC_ID",
  ],
] as const)(
  "refuses %s before changing the configuration",
  async (_name, env, setting) => {
    const home = await createTestTempDirectory("KodMercek-invalid-environment-");
    const directory = join(home, ".cursor");
    const configPath = join(directory, "mcp.json");
    await mkdir(directory);
    const original = JSON.stringify({
      mcpServers: { KodMercek: { command: "KodMercek", args: ["mcp"], env } },
    });
    await writeFile(configPath, original);
    const client = { name: "cursor", format: "json", configPath } as const;
    expect(
      await inspectClientConfiguration(client, {}, ["KodMercek", "mcp"]),
    ).toMatchObject({
      status: "invalid",
      remediation: expect.stringContaining(setting),
    });
    expect(
      await configureClientConfiguration(client, {}, ["KodMercek", "mcp"]),
    ).toEqual({ status: "failed", reason: "readback" });
    expect(await clientConfigurationAligned(client, {}, ["KodMercek", "mcp"])).toBe(
      false,
    );
    const statuses = await readClientRegistrationStatuses(home, "KodMercek", {
      environment: {},
    });
    expect(statuses.find(({ client }) => client === "cursor")).toMatchObject({
      state: "invalid",
      remediation: expect.stringContaining(setting),
    });
    expect(await readFile(configPath, "utf8")).toBe(original);
    await expect(access(`${configPath}.KodMercek.backup`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);

