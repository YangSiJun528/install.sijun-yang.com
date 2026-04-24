#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseConfigText } from "./worker.js";

const configPath = process.argv[2] ?? "redirects.json";
const text = await readFile(configPath, "utf8");
const config = parseConfigText(text, configPath);

console.log(`OK ${configPath}: ${config.files.length} file redirect(s)`);
