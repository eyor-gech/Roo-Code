import fs from "fs"
import path from "path"
import { sha256 } from "../utils/hash.js"
import type { ToolRequest, ToolResponse } from "../hooks/hook_engine.js"

export const TRACE_FILE = path.resolve(process.cwd(), "agent_trace.jsonl")

export type WriteFileRequest = ToolRequest

export async function write_file(request: WriteFileRequest): Promise<ToolResponse> {
	try {
		const targetPath = path.isAbsolute(request.targetFile)
			? request.targetFile
			: path.resolve(process.cwd(), request.targetFile)

		// --- PHASE 4: CONCURRENCY CONTROL (Optimistic Locking) ---
		if (fs.existsSync(targetPath)) {
			const currentDiskContent = fs.readFileSync(targetPath, "utf-8")
			const actualDiskHash = sha256(currentDiskContent)

			// If the agent provides a base_hash, it MUST match the disk
			if (request.base_hash && request.base_hash !== actualDiskHash) {
				return {
					success: false,
					error: {
						type: "STALE_FILE",
						intent_id: request.intent_id,
						target: request.targetFile,
						message:
							"Optimistic Locking Failure: The file has been modified by another process since you last read it. Re-read the file to sync.",
					},
				}
			}
		}
		// ---------------------------------------------------------

		const content = typeof request.args[0] === "string" ? request.args[0] : JSON.stringify(request.args[0], null, 2)

		fs.mkdirSync(path.dirname(targetPath), { recursive: true })
		fs.writeFileSync(targetPath, content, "utf-8")

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
			// Logic for Phase 4: Record what version we built upon
			predecessor_hash: request.base_hash || null,
		}

		fs.appendFileSync(TRACE_FILE, JSON.stringify(traceEntry) + "\n")

		return { success: true, result: `Written ${request.targetFile} and trace recorded` }
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
