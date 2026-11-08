import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = resolve(fileURLToPath(new URL("../../.github/scripts/push-main-with-retry.sh", import.meta.url)));
const bash = process.env.BASH_PATH || "bash";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "al-warda-push-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const first = join(root, "first");
  const second = join(root, "second");
  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(root, "clone", origin, first);
  git(first, "config", "user.name", "Test");
  git(first, "config", "user.email", "test@example.com");
  writeFileSync(join(first, "base.txt"), "base\n");
  git(first, "add", "base.txt");
  git(first, "commit", "-m", "base");
  git(first, "push", "origin", "HEAD:main");
  git(root, "clone", origin, second);
  git(second, "config", "user.name", "Test");
  git(second, "config", "user.email", "test@example.com");
  return { root, first, second, origin };
}

test("publishes generated changes on top of a newer main and preserves the backup", (t) => {
  const { root, first, second } = setup(t);
  const image = Buffer.from([0, 1, 2, 255]);
  writeFileSync(join(first, "image.png"), image);
  git(first, "add", "image.png");
  git(first, "commit", "-m", "generated image");
  const bundle = join(root, "images.bundle");
  git(first, "bundle", "create", bundle, "HEAD", "^HEAD^");
  writeFileSync(join(second, "other.txt"), "other change\n");
  git(second, "add", "other.txt");
  git(second, "commit", "-m", "other change");
  git(second, "push", "origin", "HEAD:main");

  const result = spawnSync(bash, [script], { cwd: first, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(first, "rev-parse", "HEAD"), git(first, "ls-remote", "origin", "refs/heads/main").split(/\s+/)[0]);
  assert.equal(readFileSync(join(first, "other.txt"), "utf8").replace(/\r\n/g, "\n"), "other change\n");
  assert.deepEqual(readFileSync(join(first, "image.png")), image);
  git(second, "bundle", "verify", bundle);
  git(second, "fetch", bundle, "HEAD");
  assert.deepEqual(execFileSync("git", ["show", "FETCH_HEAD:image.png"], { cwd: second }), image);
});

test("a conflicting update fails without overwriting main or losing the local commit", (t) => {
  const { first, second } = setup(t);
  writeFileSync(join(first, "base.txt"), "local\n");
  git(first, "commit", "-am", "local");
  const localCommit = git(first, "rev-parse", "HEAD");
  writeFileSync(join(second, "base.txt"), "remote\n");
  git(second, "commit", "-am", "remote");
  git(second, "push", "origin", "HEAD:main");
  const remoteCommit = git(second, "rev-parse", "HEAD");

  const result = spawnSync(bash, [script], { cwd: first, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(git(first, "rev-parse", "HEAD"), localCommit);
  assert.equal(git(second, "ls-remote", "origin", "refs/heads/main").split(/\s+/)[0], remoteCommit);
  assert.equal(readFileSync(join(first, "base.txt"), "utf8").replace(/\r\n/g, "\n"), "local\n");
});
