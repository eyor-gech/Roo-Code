import { describe, it, expect, beforeEach, vi } from "vitest"
import { runTool, type ToolRequest } from "./hook_engine.js"
import fs from "fs"
import path from "path"

// --- TOP 3 ENGINEER FIX: ISOLATE THE ENVIRONMENT ---
// This prevents the real file system configs from interfering with the logic test
vi.mock("../tools/load_intents.js", () => ({
	load_intents: vi.fn(() => ({
		"REQ-001": {
			description: "Governor Test Intent",
			scope: ["packages/core/src/tools/"],
		},
	})),
}))

vi.mock("./intent_ignore.js", () => ({
	loadIntentIgnore: vi.fn(() => []), // Ensure REQ-001 isn't on the ignore list
}))
// ---------------------------------------------------

const GOVERNOR_FILE = path.resolve(process.cwd(), "packages/core/src/tools/governor_test.ts")
const CLAUDE_MD = path.resolve(process.cwd(), "CLAUDE.md")

describe("Phase 5 - The Governor (Self-Correction)", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		if (fs.existsSync(GOVERNOR_FILE)) fs.unlinkSync(GOVERNOR_FILE)
		// Ensure CLAUDE.md exists
		if (!fs.existsSync(CLAUDE_MD)) fs.writeFileSync(CLAUDE_MD, "# Memory Bank\n", "utf-8")
	})

	it("BLOCKS write with broken syntax and records to memory", async () => {
		const brokenRequest: ToolRequest = {
			toolName: "write_file",
			args: ["function broken() { console.log('missing brace'); "], // Missing '}'
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/governor_test.ts",
			mutation_class: "INTENT_EVOLUTION",
		}

		const result = await runTool(brokenRequest)

		// Security check should pass, but Syntax check should fail
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.type).toBe("SYNTAX_ERROR")
			expect(result.error.message).toContain("Governor blocked write")
		}

		const memory = fs.readFileSync(CLAUDE_MD, "utf-8")
		expect(memory).toContain("Governor blocked write")
	})

	it("ALLOWS write with valid syntax", async () => {
		const validRequest: ToolRequest = {
			toolName: "write_file",
			args: ["function working() { return true; }"], // Correct braces
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/governor_test.ts",
			mutation_class: "AST_REFACTOR",
		}

		const result = await runTool(validRequest)

		expect(result.success).toBe(true)
		expect(fs.existsSync(GOVERNOR_FILE)).toBe(true)
	})
})
