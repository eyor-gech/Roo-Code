import fs from "fs"
import path from "path"
import { sha256 } from "../utils/hash.js"
import { record_lesson } from "./record_lesson.js"
import type { ToolRequest, ToolResponse } from "../hooks/hook_engine.js"

export const TRACE_FILE = path.resolve(process.cwd(), "agent_trace.jsonl")

export type WriteFileRequest = ToolRequest

/**
 * PHASE 5: THE GOVERNOR
 * Validates basic syntax integrity to prevent the agent from saving broken code.
 */
function validateSyntax(content: string, fileName: string): { valid: boolean; error?: string } {
	// Only validate syntax for code files
	const ext = path.extname(fileName)
	if (![".ts", ".js", ".tsx", ".jsx", ".json"].includes(ext)) return { valid: true }

	// JSON Validation
	if (ext === ".json") {
		try {
			JSON.parse(content)
			return { valid: true }
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e)
			return { valid: false, error: `Invalid JSON: ${message}` }
		}
	}

	// Bracket/Brace Integrity Check
	const stack: string[] = []
	const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")" }
	const closers = new Set(Object.values(pairs))

	for (let i = 0; i < content.length; i++) {
		const char = content[i]!
		if (pairs[char]) {
			stack.push(char)
		} else if (closers.has(char)) {
			const last = stack.pop()
			if (!last || pairs[last] !== char) {
				return { valid: false, error: `Unmatched closing character '${char}' at index ${i}` }
			}
		}
	}

	if (stack.length > 0) {
		return { valid: false, error: `Unclosed opening character '${stack.pop()}' detected at end of file` }
	}

	return { valid: true }
}

export async function write_file(request: WriteFileRequest): Promise<ToolResponse> {
	try {
		const targetPath = path.isAbsolute(request.targetFile)
			? request.targetFile
			: path.resolve(process.cwd(), request.targetFile)

		const content = typeof request.args[0] === "string" ? request.args[0] : JSON.stringify(request.args[0], null, 2)

		// --- PHASE 5: THE GOVERNOR (Syntax Guard) ---
		const syntaxResult = validateSyntax(content, request.targetFile)
		if (!syntaxResult.valid) {
			const lessonMsg = `Governor blocked write to ${request.targetFile}: ${syntaxResult.error}`
			await record_lesson(lessonMsg, request.intent_id)

			return {
				success: false,
				error: {
					type: "SYNTAX_ERROR",
					intent_id: request.intent_id,
					target: request.targetFile,
					message: lessonMsg,
				},
			}
		}

		// --- PHASE 4: CONCURRENCY CONTROL (Optimistic Locking) ---
		if (fs.existsSync(targetPath)) {
			const currentDiskContent = fs.readFileSync(targetPath, "utf-8")
			const actualDiskHash = sha256(currentDiskContent)

			if (request.base_hash && request.base_hash !== actualDiskHash) {
				return {
					success: false,
					error: {
						type: "STALE_FILE",
						intent_id: request.intent_id,
						target: request.targetFile,
						message: "Optimistic Locking Failure: File changed on disk. Re-read before writing.",
					},
				}
			}
		}

		// --- EXECUTION PHASE ---
		fs.mkdirSync(path.dirname(targetPath), { recursive: true })
		fs.writeFileSync(targetPath, content, "utf-8")

		// --- PHASE 3: TRACEABILITY (Ledger Recording) ---
		const contentHash = sha256(content)
		const traceEntry = {
			timestamp: new Date().toISOString(),
			tool: request.toolName,
			mutation_class: request.mutation_class,
			related: [request.intent_id],
			ranges: {
				target: request.targetFile,
				content_hash: contentHash,
			},
			predecessor_hash: request.base_hash || null,
		}

		fs.appendFileSync(TRACE_FILE, JSON.stringify(traceEntry) + "\n")

		return { success: true, result: `Verified and written ${request.targetFile}` }
	} catch (err: unknown) {
		return {
			success: false,
			error: {
				type: "FILE_WRITE_ERROR",
				intent_id: request.intent_id,
				target: request.targetFile,
				message: err instanceof Error ? err.message : String(err),
			},
		}
	}
}
