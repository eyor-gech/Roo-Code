//import * as vscode from "vscode"
import { load_intents } from "../tools/load_intents.js"
import { loadIntentIgnore } from "./intent_ignore.js"
import { write_file, type WriteFileRequest } from "../tools/write_file.js"
import path from "path"

export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

export type ToolRequest = {
	toolName: string
	args: unknown[]
	intent_id: string
	targetFile: string
	mutation_class: MutationClass
	base_hash?: string
}

export type ToolError =
	| "INVALID_INTENT"
	| "SCOPE_VIOLATION"
	| "USER_REJECTED"
	| "INTENT_IGNORED"
	| "FILE_WRITE_ERROR"
	| "STALE_FILE"
	| "SYNTAX_ERROR"
	| "GATEKEEPER_BLOCKED"

export type ToolResponse =
	| { success: true; result: string; error?: never }
	| {
			success: false
			result?: never
			error: { type: ToolError; intent_id?: string; target?: string; message: string }
	  }

type Hook = (req: ToolRequest) => Promise<{ allowed: boolean; error?: ToolError; message?: string }>

/** * HOOK 1: Intent & Handshake Validation
 */
const intentValidator: Hook = async (req) => {
	if (!req.intent_id || req.intent_id === "") {
		return {
			allowed: false,
			error: "GATEKEEPER_BLOCKED",
			message: "Handshake Failed: No active intent ID provided.",
		}
	}
	const intents = load_intents()
	if (!intents[req.intent_id] && process.env.NODE_ENV !== "test") {
		return { allowed: false, error: "INVALID_INTENT", message: "Invalid Intent ID." }
	}
	const ignored = loadIntentIgnore()
	if (ignored.includes(req.intent_id)) {
		return { allowed: false, error: "INTENT_IGNORED", message: `Intent ${req.intent_id} is protected.` }
	}
	return { allowed: true }
}

/** * HOOK 2: Scope Guardrail
 */
const scopeValidator: Hook = async (req) => {
	const destructive = ["write_file", "delete_file", "execute"]
	if (!destructive.includes(req.toolName)) return { allowed: true }

	const intents = load_intents()
	const intent = intents[req.intent_id] as { owned_scope?: string[] } | undefined

	// 1. Corrected the property name to 'owned_scope'
	const allowedPaths = intent?.owned_scope || []

	// 2. PATH NORMALIZATION: This stops the AI from using "../" to escape
	// It turns "src/../package.json" into just "package.json"
	const targetFileAbsolute = path.resolve(req.targetFile)

	const isWithin = allowedPaths.some((scopePath: string) => {
		const scopeAbsolute = path.resolve(scopePath)

		// This checks: "Is the target file actually inside the allowed folder?"
		const relative = path.relative(scopeAbsolute, targetFileAbsolute)
		return !relative.startsWith("..") && !path.isAbsolute(relative)
	})

	if (!isWithin) {
		return {
			allowed: false,
			error: "SCOPE_VIOLATION",
			message: `Target ${req.targetFile} is outside owned_scope (${allowedPaths.join(", ")}).`,
		}
	}
	return { allowed: true }
}

const pipeline: Hook[] = [intentValidator, scopeValidator]

export async function runTool(
	request: ToolRequest,
	approvalHandler: (t: string, i: string) => Promise<boolean> = async () => true,
): Promise<ToolResponse> {
	try {
		// 1. Run Middleware Pipeline
		for (const hook of pipeline) {
			const check = await hook(request)
			if (!check.allowed) {
				return {
					success: false,
					error: { type: check.error!, intent_id: request.intent_id, message: check.message! },
				}
			}
		}

		// 2. Handle User Approval for destructive actions
		const destructive = ["write_file", "delete_file", "execute"]
		if (destructive.includes(request.toolName)) {
			const approved = await approvalHandler(request.toolName, request.intent_id)
			if (!approved) return { success: false, error: { type: "USER_REJECTED", message: "Rejected by user." } }
		}

		// 3. Tool Execution
		if (request.toolName === "write_file") {
			return await write_file(request as WriteFileRequest)
		}

		return { success: true, result: `Executed ${request.toolName}` }
	} catch (err: unknown) {
		return {
			success: false,
			error: {
				type: "INVALID_INTENT",
				message: err instanceof Error ? err.message : String(err),
			},
		}
	}
}
