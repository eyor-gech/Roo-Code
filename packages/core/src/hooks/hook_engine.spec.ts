import { describe, it, expect, vi, beforeEach } from "vitest"
import { runTool, type ToolRequest } from "./hook_engine.js"
import * as intentModule from "../tools/load_intents.js"
import * as ignoreModule from "./intent_ignore.js"

describe("Phase 2 & 3 Integrated Security Bridge", () => {
	beforeEach(() => {
		vi.restoreAllMocks()

		// Mocking the intent store with correct 'id' property
		vi.spyOn(intentModule, "load_intents").mockReturnValue({
			"REQ-001": {
				id: "REQ-001", // <--- required for TS Intent type
				description: "Test Intent",
				constraints: [] as string[],
				scope: ["packages/core/src/tools/"],
			},
		})

		vi.spyOn(ignoreModule, "loadIntentIgnore").mockReturnValue([] as string[])
	})

	it("blocks destructive commands outside scope", async () => {
		const req: ToolRequest = {
			toolName: "write_file",
			args: ["code"],
			intent_id: "REQ-001",
			targetFile: "unauthorized_file.ts",
			mutation_class: "INTENT_EVOLUTION",
		}

		const res = await runTool(req)

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("SCOPE_VIOLATION")
	})

	it("executes safe commands with full schema compliance", async () => {
		const req: ToolRequest = {
			toolName: "select_active_intent",
			args: ["REQ-001"],
			intent_id: "REQ-001",
			targetFile: "N/A",
			mutation_class: "AST_REFACTOR",
		}

		const res = await runTool(req)
		expect(res.success).toBe(true)
	})

	it("blocks when user rejects destructive command", async () => {
		const req: ToolRequest = {
			toolName: "write_file",
			args: ["content"],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/file.ts",
			mutation_class: "AST_REFACTOR",
		}

		const res = await runTool(req, async () => false) // User says NO

		expect(res.success).toBe(false)
		expect(res.error?.type).toBe("USER_REJECTED")
	})
})
