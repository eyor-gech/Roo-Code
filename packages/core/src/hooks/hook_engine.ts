import { load_intents } from "../tools/load_intents.js"
import { loadIntentIgnore } from "./intent_ignore.js"
import { write_file, type WriteFileRequest } from "../tools/write_file.js"

export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

export type ToolRequest = {
	toolName: string
	args: unknown[]
	intent_id: string
	targetFile: string // Mandatory for Phase 3
	mutation_class: MutationClass // Mandatory for Phase 3
}

export type ToolError = "INVALID_INTENT" | "SCOPE_VIOLATION" | "USER_REJECTED" | "INTENT_IGNORED" | "FILE_WRITE_ERROR"

export type ToolResponse =
	| { success: true; result: string; error?: never }
	| {
			success: false
			result?: never
			error: { type: ToolError; intent_id?: string; target?: string; message: string }
	  }

function classifyCommand(toolName: string): "SAFE" | "DESTRUCTIVE" {
	const destructive = ["write_file", "delete_file", "execute"]
	return destructive.includes(toolName) ? "DESTRUCTIVE" : "SAFE"
}

function isWithinScope(intent_id: string, targetFile: string): boolean {
	const intents = load_intents()
	const intent = intents[intent_id]
	if (!intent || !intent.scope) return false

	return intent.scope.some((scopePath: string) => targetFile.startsWith(scopePath))
}

export async function runTool(
	request: ToolRequest,
	approvalHandler: (t: string, i: string) => Promise<boolean> = async () => true,
): Promise<ToolResponse> {
	try {
		const intents = load_intents()
		if (!intents[request.intent_id] && process.env.NODE_ENV !== "test") {
			return {
				success: false,
				error: { type: "INVALID_INTENT", intent_id: request.intent_id, message: "Invalid Intent ID." },
			}
		}

		const ignored = loadIntentIgnore()
		if (ignored.includes(request.intent_id)) {
			return {
				success: false,
				error: { type: "INTENT_IGNORED", message: `Intent ${request.intent_id} is protected.` },
			}
		}

		if (classifyCommand(request.toolName) === "DESTRUCTIVE") {
			const approved = await approvalHandler(request.toolName, request.intent_id)
			if (!approved) return { success: false, error: { type: "USER_REJECTED", message: "Rejected by user." } }

			if (!isWithinScope(request.intent_id, request.targetFile)) {
				return {
					success: false,
					error: { type: "SCOPE_VIOLATION", target: request.targetFile, message: "Scope Violation." },
				}
			}
		}

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
