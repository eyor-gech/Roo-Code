import fs from "fs"
import path from "path"
import * as vscode from "vscode"
import yaml from "js-yaml"

// Define the shape of your intent
interface Intent {
	id: string
	name?: string
	owned_scope?: string
	[key: string]: unknown
}

/**
 * Load active intents from the current workspace.
 */
export function load_intents(): Record<string, Intent> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	if (!workspaceRoot) return {}

	const intentsPath = path.resolve(workspaceRoot, ".orchestration", "active_intents.yaml")
	if (!fs.existsSync(intentsPath)) {
		console.warn(`Intents file not found at: ${intentsPath}`)
		return {}
	}

	try {
		const fileContents = fs.readFileSync(intentsPath, "utf8")
		const data = yaml.load(fileContents) as { active_intents?: Intent[] } | undefined

		const intents: Record<string, Intent> = {}
		if (data?.active_intents) {
			for (const intent of data.active_intents) {
				// Map owned_scope to scope, keep original properties
				intents[intent.id] = { ...intent, scope: intent.owned_scope }
			}
		}

		return intents
	} catch (err) {
		console.error("Error loading intents:", err instanceof Error ? err.message : err)
		return {}
	}
}
