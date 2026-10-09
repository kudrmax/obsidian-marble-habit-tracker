import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const target = join(process.env.VAULT ?? join(homedir(), "Obsidian"), ".obsidian", "plugins", id);
mkdirSync(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(file, join(target, file));
console.log(`Deployed to ${target}`);
