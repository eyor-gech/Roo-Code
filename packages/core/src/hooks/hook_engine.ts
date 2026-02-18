import { load_intents } from "../tools/load_intents.js"
import { loadIntentIgnore } from "./intent_ignore.js"

// Structure for tool execution request
export type ToolRequest = {
	toolName: string
	args: unknown[]
	intent_id: string
	targetFile?: string
}

// Structured error type (Phase 2 requirement)
export type ToolError = {
	type: "INVALID_INTENT" | "SCOPE_VIOLATION" | "USER_REJECTED" | "INTENT_IGNORED"
	intent_id?: string
	target?: string
	message: string
}

// Structure for tool execution response
export type ToolResponse = {
	success: boolean
	result?: unknown
	error?: ToolError
}

// Automatically classify tool
function classifyCommand(toolName: string): "SAFE" | "DESTRUCTIVE" {
	const destructiveTools = ["write_file", "delete_file", "execute"]
	return destructiveTools.includes(toolName) ? "DESTRUCTIVE" : "SAFE"
}

// Check if file is within intent scope
function isWithinScope(intent_id: string, targetFile: string): boolean {
	const intents = load_intents()
	const intent = intents[intent_id]

	if (!intent || !intent.scope) return false

	return intent.scope.some((scopePath) => targetFile.startsWith(scopePath))
}

// ApprovalHandler Type
export type ApprovalHandler = (toolName: string, intent_id: string) => Promise<boolean>

// Default Approval Handler
async function defaultApproval(): Promise<boolean> {
	return true
}

// Hook engine
export async function runTool(
	request: ToolRequest,
	approvalHandler: ApprovalHandler = defaultApproval,
): Promise<ToolResponse> {
	try {
		const intents = load_intents()
		const intent = intents[request.intent_id]

		// Step 1: Validate intent
		if (!intent) {
			return {
				success: false,
				error: {
					type: "INVALID_INTENT",
					intent_id: request.intent_id,
					message: "You must cite a valid active Intent ID.",
				},
			}
		}

		// Step 2: Absolute ignore check (MUST be early)
		const ignoredIntents = loadIntentIgnore()

		if (ignoredIntents.includes(request.intent_id)) {
			return {
				success: false,
				error: {
					type: "INTENT_IGNORED",
					intent_id: request.intent_id,
					message: `Intent ${request.intent_id} is protected by .intentignore`,
				},
			}
		}

		// Step 3: Classify command
		const classification = classifyCommand(request.toolName)

		// Step 4: Enforce destructive rules
		if (classification === "DESTRUCTIVE") {
			const approved = await approvalHandler(request.toolName, request.intent_id)

			if (!approved) {
				return {
					success: false,
					error: {
						type: "USER_REJECTED",
						intent_id: request.intent_id,
						message: "Tool execution rejected by user.",
					},
				}
			}

			if (request.targetFile && !isWithinScope(request.intent_id, request.targetFile)) {
				return {
					success: false,
					error: {
						type: "SCOPE_VIOLATION",
						intent_id: request.intent_id,
						target: request.targetFile,
						message: `Scope Violation: ${request.intent_id} is not authorized to edit ${request.targetFile}. Request scope expansion.`,
					},
				}
			}
		}

		// Step 5: Execute tool (simulated)
		return {
			success: true,
			result: `Executed ${request.toolName}`,
		}
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
