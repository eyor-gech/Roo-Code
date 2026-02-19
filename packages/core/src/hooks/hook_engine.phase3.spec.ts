import { describe, it, expect, beforeEach, vi } from "vitest"
import { runTool, type ToolRequest } from "./hook_engine.js"
import fs from "fs"
import path from "path"
import { TRACE_FILE } from "../tools/write_file.js"

// Mocking dependencies - Note: 'id' removed from object to fix TS error
vi.mock("../tools/load_intents.js", () => ({
	load_intents: vi.fn(() => ({
		"REQ-001": {
			description: "Phase 3 Test Intent",
			scope: ["packages/core"],
		},
	})),
}))

vi.mock("./intent_ignore.js", () => ({ loadIntentIgnore: vi.fn(() => []) }))

const TEST_FILE_1 = path.resolve(process.cwd(), "packages/core/src/tools/test_phase3.ts")
const TEST_FILE_2 = path.resolve(process.cwd(), "packages/core/src/tools/test_2.ts")

describe("Phase 3 Hook Engine - Full Traceability", () => {
	beforeEach(() => {
		// Clean up before each test run
		if (fs.existsSync(TRACE_FILE)) fs.unlinkSync(TRACE_FILE)
		if (fs.existsSync(TEST_FILE_1)) fs.unlinkSync(TEST_FILE_1)
		if (fs.existsSync(TEST_FILE_2)) fs.unlinkSync(TEST_FILE_2)
	})

	it("fulfills Phase 3 requirements: multi-line ledger with spatial hashing", async () => {
		// Write 1: An AST Refactor
		const req1: ToolRequest = {
			toolName: "write_file",
			args: ["console.log('Phase 3 Evidence');"],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/test_phase3.ts",
			mutation_class: "AST_REFACTOR",
		}

		// Write 2: A New Feature (Intent Evolution)
		const req2: ToolRequest = {
			toolName: "write_file",
			args: ["export const data = 42;"],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/test_2.ts",
			mutation_class: "INTENT_EVOLUTION",
		}

		// Execute sequential writes
		const res1 = await runTool(req1)
		const res2 = await runTool(req2)

		expect(res1.success).toBe(true)
		expect(res2.success).toBe(true)

		// Read the Semantic Ledger (.jsonl)
		const traceContent = fs.readFileSync(TRACE_FILE, "utf-8").trim()
		const lines = traceContent.split("\n")

		// Verification 1: Length of ledger
		expect(lines.length).toBe(2)

		// Verification 2: Check Semantic Classification of Line 1
		const traceData1 = JSON.parse(lines[0]!)
		expect(traceData1.mutation_class).toBe("AST_REFACTOR")
		expect(traceData1.related).toContain("REQ-001")
		expect(traceData1.ranges.content_hash).toBeDefined()

		// Verification 3: Check Semantic Classification of Line 2
		const traceData2 = JSON.parse(lines[1]!)
		expect(traceData2.mutation_class).toBe("INTENT_EVOLUTION")
		expect(traceData2.ranges.target).toContain("test_2.ts")

		console.log("✅ Phase 3 Multi-line Trace recorded at:", TRACE_FILE)
	})
})
