import fs from "fs"
import path from "path"
import * as vscode from "vscode"
import { sha256 } from "../utils/hash.js"
import { record_lesson } from "./record_lesson.js"
import type { ToolRequest, ToolResponse } from "../hooks/hook_engine.js"

export type WriteFileRequest = ToolRequest

function validateSyntax(content: string, fileName: string): { valid: boolean; error?: string } {
	const ext = path.extname(fileName)
	if (![".ts", ".js", ".tsx", ".jsx", ".json"].includes(ext)) return { valid: true }

	if (ext === ".json") {
		try {
			JSON.parse(content)
			return { valid: true }
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			return { valid: false, error: `Invalid JSON: ${msg}` }
		}
	}

	const stack: string[] = []
	const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")" }
	const closers = new Set(Object.values(pairs))

	for (let i = 0; i < content.length; i++) {
		const char = content[i]!
		if (pairs[char]) stack.push(char)
		else if (closers.has(char)) {
			const last = stack.pop()
			if (!last || pairs[last] !== char) {
				return { valid: false, error: `Unmatched closing character '${char}'` }
			}
		}
	}

	return stack.length === 0 ? { valid: true } : { valid: false, error: "Unclosed character detected" }
}

export async function write_file(request: WriteFileRequest): Promise<ToolResponse> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()

	const orchestrationDir = path.resolve(workspaceRoot, ".orchestration")
	const TRACE_FILE = path.resolve(orchestrationDir, "agent_trace.jsonl")

	const targetPath = path.resolve(workspaceRoot, request.targetFile)
	const content = typeof request.args[0] === "string" ? request.args[0] : JSON.stringify(request.args[0], null, 2)

	try {
		if (!fs.existsSync(orchestrationDir)) {
			fs.mkdirSync(orchestrationDir, { recursive: true })
		}

		// -----------------------------
		// 1️⃣ LEDGER FIRST (PENDING)
		// -----------------------------
		const pendingTrace = {
			timestamp: new Date().toISOString(),
			tool: request.toolName,
			status: "PENDING",
			mutation_class: request.mutation_class || "INTENT_EVOLUTION",
			related: [request.intent_id],
			target: request.targetFile,
		}

		fs.appendFileSync(TRACE_FILE, JSON.stringify(pendingTrace) + "\n")

		// -----------------------------
		// 2️⃣ SYNTAX GOVERNOR
		// -----------------------------
		const syntaxResult = validateSyntax(content, request.targetFile)
		if (!syntaxResult.valid) {
			await record_lesson(`Governor blocked write: ${syntaxResult.error}`, request.intent_id)

			const failedTrace = {
				...pendingTrace,
				status: "FAILED",
				error: syntaxResult.error,
			}

			fs.appendFileSync(TRACE_FILE, JSON.stringify(failedTrace) + "\n")

			return {
				success: false,
				error: {
					type: "SYNTAX_ERROR",
					intent_id: request.intent_id,
					target: request.targetFile,
					message: syntaxResult.error!,
				},
			}
		}

		// -----------------------------
		// 3️⃣ CONCURRENCY CHECK
		// -----------------------------
		if (fs.existsSync(targetPath)) {
			const diskHash = sha256(fs.readFileSync(targetPath, "utf-8"))
			if (request.base_hash && request.base_hash !== diskHash) {
				const failedTrace = {
					...pendingTrace,
					status: "FAILED",
					error: "Stale file detected",
				}

				fs.appendFileSync(TRACE_FILE, JSON.stringify(failedTrace) + "\n")

				return {
					success: false,
					error: {
						type: "STALE_FILE",
						intent_id: request.intent_id,
						target: request.targetFile,
						message: "Stale File detected.",
					},
				}
			}
		}

		// -----------------------------
		// 4️⃣ EXECUTION
		// -----------------------------
		fs.mkdirSync(path.dirname(targetPath), { recursive: true })
		fs.writeFileSync(targetPath, content, "utf-8")

		// -----------------------------
		// 5️⃣ SUCCESS LEDGER UPDATE
		// -----------------------------
		const successTrace = {
			...pendingTrace,
			status: "SUCCESS",
			content_hash: sha256(content),
		}

		fs.appendFileSync(TRACE_FILE, JSON.stringify(successTrace) + "\n")

		await record_lesson(`Successfully wrote to ${request.targetFile}`, request.intent_id)

		return {
			success: true,
			result: `Verified and written ${request.targetFile}`,
		}
	} catch (err: unknown) {
		const failedTrace = {
			timestamp: new Date().toISOString(),
			tool: request.toolName,
			status: "FAILED",
			mutation_class: request.mutation_class || "INTENT_EVOLUTION",
			related: [request.intent_id],
			target: request.targetFile,
			error: err instanceof Error ? err.message : String(err),
		}

		try {
			fs.appendFileSync(TRACE_FILE, JSON.stringify(failedTrace) + "\n")
		} catch {
			// Avoid crashing if ledger write fails
		}

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
