#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const USAGE = `Usage:
  node prove-test-fails.mjs --file <path> (--find <text> | --find-file <path>)
    (--replace <text> | --replace-file <path>) [--expect <text>] -- <test command>`;

const OUTPUT_TAIL_LINES = 40;

function fail(message, code = 2) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(code);
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator === -1) fail("Missing `--` before the test command.");
  const command = argv.slice(separator + 1);
  if (command.length === 0) fail("Missing test command after `--`.");

  const options = {};
  const flags = argv.slice(0, separator);
  for (let i = 0; i < flags.length; i += 2) {
    const name = flags[i];
    const value = flags[i + 1];
    if (!name.startsWith("--") || value === undefined) fail(`Invalid option: ${name}`);
    options[name.slice(2)] = value;
  }

  const known = new Set(["file", "find", "find-file", "replace", "replace-file", "expect"]);
  for (const name of Object.keys(options)) {
    if (!known.has(name)) fail(`Unknown option: --${name}`);
  }
  if (!options.file) fail("Missing --file.");

  const find = options["find-file"] ? readFileSync(options["find-file"], "utf8") : options.find;
  const replace = options["replace-file"] ? readFileSync(options["replace-file"], "utf8") : options.replace;
  if (find === undefined) fail("Missing --find or --find-file.");
  if (replace === undefined) fail("Missing --replace or --replace-file.");
  if (find === replace) fail("--find and --replace are identical, so nothing would break.");

  return { file: options.file, find, replace, expect: options.expect, command };
}

function quote(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function runTest(command) {
  // Windows resolves npx and other .cmd shims only through a shell.
  const result = spawnSync(command.map(quote).join(" "), {
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function tail(text) {
  return text.trimEnd().split(/\r?\n/).slice(-OUTPUT_TAIL_LINES).join("\n");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function countOccurrences(text, search) {
  let count = 0;
  for (let at = text.indexOf(search); at !== -1; at = text.indexOf(search, at + search.length)) count++;
  return count;
}

const args = parseArgs(process.argv.slice(2));

let original;
try {
  original = readFileSync(args.file);
} catch (error) {
  fail(`Cannot read ${args.file}: ${error.message}`);
}
const originalHash = sha256(original);
const originalText = original.toString("utf8");

const matches = countOccurrences(originalText, args.find);
if (matches !== 1) fail(`--find must match exactly once in ${args.file}, but matched ${matches} times.`);

console.log("Step 1/3: running the test on the unbroken code...");
const baseline = runTest(args.command);
if (baseline.exitCode !== 0) {
  console.log(`\nNOT PROVEN: the test fails before the break (exit code ${baseline.exitCode}). Fix it first.\n`);
  console.log(tail(baseline.output));
  process.exit(1);
}

let restored = false;
function restore() {
  if (restored) return;
  writeFileSync(args.file, original);
  restored = sha256(readFileSync(args.file)) === originalHash;
  if (!restored) {
    console.error(`\nRESTORE FAILED: ${args.file} doesn't match its original content. Undo the replacement by hand.`);
    process.exit(2);
  }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

let broken;
try {
  writeFileSync(args.file, originalText.replace(args.find, () => args.replace));
  console.log(`Step 2/3: running the test with ${args.file} broken...`);
  broken = runTest(args.command);
} finally {
  restore();
}
console.log(`Step 3/3: restored ${args.file} (content identical to before).\n`);

const failed = broken.exitCode !== 0;
const expectMatched = args.expect === undefined || broken.output.includes(args.expect);

console.log(`Before break: passed`);
console.log(`After break:  ${failed ? `failed (exit code ${broken.exitCode})` : "PASSED"}`);
if (args.expect !== undefined) {
  console.log(`Expected text "${args.expect}" in failure output: ${expectMatched ? "found" : "NOT FOUND"}`);
}

if (!failed) {
  console.log("\nNOT PROVEN: the test still passes with the feature broken, so it is tautological or tests something else.");
  process.exit(1);
}
if (!expectMatched) {
  console.log("\nNOT PROVEN: the test failed, but not with the expected output. Check the failure below; it may be a timeout, selector, or setup error.\n");
  console.log(tail(broken.output));
  process.exit(1);
}

console.log("\nPROVEN: the test fails when the code is broken and passes when it is restored.");
console.log(`\nFailure output (last ${OUTPUT_TAIL_LINES} lines):\n`);
console.log(tail(broken.output));
