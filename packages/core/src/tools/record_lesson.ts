import fs from "fs"
import path from "path"
import * as vscode from "vscode"

export async function record_lesson(lesson: string, intent_id: string): Promise<string> {
	// 1. Get the current active workspace
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

	if (!workspaceRoot) {
		return "No workspace folder found to record lesson."
	}

	const claudePath = path.join(workspaceRoot, "CLAUDE.md")
	const timestamp = new Date().toLocaleString() // More readable than ISO for a log

	const entry = `\n### [${timestamp}] Lesson Learned (Intent: ${intent_id})\n- ${lesson}\n`

	try {
		// 2. Initialize file if missing
		if (!fs.existsSync(claudePath)) {
			fs.writeFileSync(claudePath, "# Memory Bank\n", "utf-8")
		}

		// 3. Append the lesson
		fs.appendFileSync(claudePath, entry, "utf-8")

		// 4. FORCE VS Code to see the new file
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer")

		return "Lesson recorded in CLAUDE.md"
	} catch (error) {
		console.error("Failed to record lesson:", error)
		return `Error recording lesson: ${error}`
	}
}
