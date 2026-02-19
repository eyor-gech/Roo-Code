import fs from "fs"
import path from "path"

export async function record_lesson(lesson: string, intent_id: string): Promise<string> {
	const claudePath = path.resolve(process.cwd(), "CLAUDE.md")
	const timestamp = new Date().toISOString()

	const entry = `\n### [${timestamp}] Lesson Learned (Intent: ${intent_id})\n- ${lesson}\n`

	fs.appendFileSync(claudePath, entry, "utf-8")
	return "Lesson recorded in CLAUDE.md"
}
