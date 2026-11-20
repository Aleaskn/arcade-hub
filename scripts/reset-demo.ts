import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const stateDirectory = resolve(process.cwd(), ".wrangler", "state");
if (!stateDirectory.endsWith("/.wrangler/state")) throw new Error("Percorso stato demo inatteso: reset annullato");
await rm(stateDirectory, { recursive: true, force: true });
console.log(`Stato demo locale rimosso: ${stateDirectory}`);
