import { describe, it, expect, beforeEach, vi } from "vitest"
import { runTool, type ToolRequest } from "./hook_engine.js"
import { sha256 } from "../utils/hash.js"
import { record_lesson } from "../tools/record_lesson.js"
import fs from "fs"
import path from "path"

// --- MOCKING SECURITY BOUNDARIES ---
vi.mock("../tools/load_intents.js", () => ({
	load_intents: vi.fn(() => ({
		"REQ-001": {
			description: "Parallel Orchestration Test",
			scope: ["packages/core/src/tools/"],
		},
	})),
}))

vi.mock("./intent_ignore.js", () => ({
	loadIntentIgnore: vi.fn(() => []),
}))

const CONCURRENCY_FILE = path.resolve(process.cwd(), "packages/core/src/tools/concurrency_test.ts")
const CLAUDE_MD = path.resolve(process.cwd(), "CLAUDE.md")

describe("Phase 4 - Parallel Orchestration (Optimistic Locking)", () => {
	beforeEach(() => {
		vi.restoreAllMocks()

		// Setup Test Files
		if (fs.existsSync(CONCURRENCY_FILE)) fs.unlinkSync(CONCURRENCY_FILE)
		fs.writeFileSync(CONCURRENCY_FILE, "Initial Content", "utf-8")

		// Ensure CLAUDE.md exists for lesson recording
		if (!fs.existsSync(CLAUDE_MD)) fs.writeFileSync(CLAUDE_MD, "# Memory Bank\n", "utf-8")
	})

	it("BLOCKS write when disk content has changed (Stale Hash) and RECORDS lesson", async () => {
		// 1. Agent reads the file state
		const initialContent = "Initial Content"
		const agent_base_hash = sha256(initialContent)

		// 2. CONCURRENCY EVENT: A human/external process edits the file
		fs.writeFileSync(CONCURRENCY_FILE, "Modified by External Process", "utf-8")

		// 3. Agent tries to write using its stale hash
		const staleRequest: ToolRequest = {
			toolName: "write_file",
			args: ["Agent's Desired Change"],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/concurrency_test.ts",
			mutation_class: "INTENT_EVOLUTION",
			base_hash: agent_base_hash,
		}

		const result = await runTool(staleRequest)

		// 4. VERIFY BLOCK: The write must be rejected
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.type).toBe("STALE_FILE")

			// 5. PHASE 4 REQ: Record the lesson learned from this failure
			const lessonMsg = `Concurrency conflict on ${staleRequest.targetFile}. Agent had stale hash.`
			await record_lesson(lessonMsg, staleRequest.intent_id)
		}

		// 6. VERIFY MEMORY: Check if CLAUDE.md was updated
		const memoryBank = fs.readFileSync(CLAUDE_MD, "utf-8")
		expect(memoryBank).toContain("Lesson Learned")
		expect(memoryBank).toContain("Concurrency conflict")

		console.log("✅ Concurrency failure blocked and recorded in CLAUDE.md")
	})

	it("ALLOWS write when hashes match (Safe Parallelism)", async () => {
		// 1. Get the current state
		const currentContent = fs.readFileSync(CONCURRENCY_FILE, "utf-8")
		const validHash = sha256(currentContent)

		// 2. Agent provides the correct current hash
		const validRequest: ToolRequest = {
			toolName: "write_file",
			args: ["Optimistic Lock Success"],
			intent_id: "REQ-001",
			targetFile: "packages/core/src/tools/concurrency_test.ts",
			mutation_class: "AST_REFACTOR",
			base_hash: validHash,
		}

		const result = await runTool(validRequest)

		// 3. VERIFY SUCCESS
		expect(result.success).toBe(true)
		const diskContent = fs.readFileSync(CONCURRENCY_FILE, "utf-8")
		expect(diskContent).toBe("Optimistic Lock Success")

		console.log("✅ Synchronized write permitted")
	})
})
