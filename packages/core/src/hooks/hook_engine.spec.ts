import { describe, it, expect, vi, beforeEach } from "vitest"
import { runTool, type ToolRequest } from "./hook_engine.js"

import * as intentModule from "../tools/load_intents.js"
import * as ignoreModule from "./intent_ignore.js"

describe("Phase 2 Hook Engine", () => {
	beforeEach(() => {
		// Mock intents
		vi.spyOn(intentModule, "load_intents").mockReturnValue({
			"REQ-001": {
				description: "Test Intent",
				constraints: [],
				scope: ["packages/core/src/tools/"],
				trace: undefined,
			},
		})

		// Default: no ignored intents
		vi.spyOn(ignoreModule, "loadIntentIgnore").mockReturnValue([])
	})

	it("executes safe commands without approval", async () => {
		const req: ToolRequest = {
			toolName: "select_active_intent",
			args: ["REQ-001"],
			intent_id: "REQ-001",
		}

		const res = await runTool(req)

		expect(res.success).toBe(true)
		expect(res.result).toContain("Executed select_active_intent")
	})

	it("blocks destructive commands outside scope", async () => {
		const req: ToolRequest = {
			toolName: "write_file",
			args: ["code"],
			intent_id: "REQ-001",
			targetFile: "unauthorized_file.ts",
		}

		const res = await runTool(req)

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("SCOPE_VIOLATION")
	})

	it("blocks when user rejects destructive command", async () => {
		const req: ToolRequest = {
			toolName: "write_file",
			args: [],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/file.ts",
		}

		const res = await runTool(req, async () => false)

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("USER_REJECTED")
	})

	it("blocks execution for ignored intent (absolute rule)", async () => {
		// Override ignore behavior for this test only
		vi.spyOn(ignoreModule, "loadIntentIgnore").mockReturnValue(["REQ-001"])

		const req: ToolRequest = {
			toolName: "write_file",
			args: [],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/file.ts",
		}

		const res = await runTool(req)

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("INTENT_IGNORED")
	})

	it("returns INVALID_INTENT for unknown intent", async () => {
		const req: ToolRequest = {
			toolName: "write_file",
			args: [],
			intent_id: "UNKNOWN",
			targetFile: "file.ts",
		}

		const res = await runTool(req)

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("INVALID_INTENT")
	})
})
