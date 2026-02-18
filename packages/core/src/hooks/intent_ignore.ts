import fs from "fs"
import path from "path"

export function loadIntentIgnore(): string[] {
	const filePath = path.resolve(process.cwd(), ".intentignore")

	if (!fs.existsSync(filePath)) {
		return []
	}

	const content = fs.readFileSync(filePath, "utf-8")

	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
}
