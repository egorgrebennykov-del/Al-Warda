import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(appDir, "..");

const STATE_FILE = path.join(os.tmpdir(), "al-warda-gpu-generation-state.json");
const LOG_FILE = path.join(os.tmpdir(), "al-warda-gpu-generation.log");

let gitPublishInFlight = null;

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: repoDir, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || stdout || err.message || "").trim()));
      } else {
        resolve((stdout || "").trim());
      }
    });
  });
}

async function publishGeneratedImagesToGit() {
  if (gitPublishInFlight) return gitPublishInFlight;
  gitPublishInFlight = (async () => {
    try {
      await runGit(["add", "Al-Warda/public/assets/img/generated-products/"]);
      const diff = await runGit(["diff", "--cached", "--name-only"]);
      if (!diff) return { published: false, reason: "no_changes" };
      await runGit([
        "commit",
        "-m",
        "chore(images): auto-publish GPU generated product cutouts",
      ]);
      try {
        await runGit(["pull", "--rebase", "origin", "main"]);
      } catch {
        // Continue push attempt if already up-to-date or no upstream conflict
      }
      await runGit(["push", "origin", "main"]);
      appendLogLine("Новые сгенерированные фото автоматически отправлены на сайт (GitHub -> Cloudflare).");
      return { published: true };
    } catch (err) {
      appendLogLine(`Предупреждение автопубликации Git: ${err.message}`);
      return { published: false, error: err.message };
    } finally {
      gitPublishInFlight = null;
    }
  })();
  return gitPublishInFlight;
}

function appendLogLine(line) {
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf-8");
  } catch {}
}

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function readPersistedState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writePersistedState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
  } catch {}
}

function parseLogSnapshot(baseState) {
  const job = {
    isRunning: false,
    mode: "local_gpu_upscayl",
    startedAt: baseState?.startedAt || null,
    finishedAt: baseState?.finishedAt || null,
    totalCandidates: 0,
    targetCount: baseState?.targetCount ?? 0,
    completedCount: 0,
    failedCount: 0,
    currentProduct: null,
    lastImageUrl: null,
    lastLogLine: "",
    logs: [],
    error: baseState?.error || null,
  };

  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, "utf-8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (line.includes("Targeting") && line.includes("specific product")) {
          const m = line.match(/Targeting (\d+)/);
          if (m) job.totalCandidates = parseInt(m[1], 10);
        } else if (line.includes("Queue:") && line.includes("eligible")) {
          const m = line.match(/Queue:\s*(\d+)/);
          if (m) job.totalCandidates = parseInt(m[1], 10);
        }

        if (line.startsWith("COMPLETED ")) {
          job.completedCount++;
          const parts = line.split(" ");
          if (parts[2]) job.lastImageUrl = parts[2].trim();
          job.currentProduct = null;
        } else if (line.startsWith("FAILED ")) {
          job.failedCount++;
          job.currentProduct = null;
        } else if (line.startsWith("DESCRIBED ") || line.includes("Processing ")) {
          job.currentProduct = line;
        }
      }
      job.logs = lines.slice(-200);
      if (job.logs.length > 0) {
        job.lastLogLine = job.logs[job.logs.length - 1];
      }
    }
  } catch {}

  const alive = isPidAlive(baseState?.pid);
  job.isRunning = alive;
  if (!alive && !job.finishedAt) {
    if (baseState?.pid) {
      job.finishedAt = new Date().toISOString();
      writePersistedState({ ...baseState, finishedAt: job.finishedAt });
    } else if (fs.existsSync(LOG_FILE)) {
      try {
        job.finishedAt = fs.statSync(LOG_FILE).mtime.toISOString();
      } catch {
        job.finishedAt = new Date(0).toISOString();
      }
    }
  }
  return job;
}

let lastPublishedCompleted = 0;

function resolvePythonBinary() {
  const candidates = [
    path.join(appDir, ".pilot-venv", "Scripts", "python.exe"),
    path.join(appDir, ".venv", "Scripts", "python.exe"),
    path.join(appDir, "venv", "Scripts", "python.exe"),
    "python3",
    "python",
  ];
  for (const cand of candidates) {
    if (cand.includes(path.sep)) {
      if (fs.existsSync(cand)) return cand;
    } else {
      return cand;
    }
  }
  return "python";
}

function resolveUpscaylBinary() {
  const candidates = [
    "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe",
    "C:\\Program Files (x86)\\Upscayl\\resources\\bin\\upscayl-bin.exe",
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

export function getGpuGenerationStatus() {
  const upscaylPath = resolveUpscaylBinary();
  const pythonPath = resolvePythonBinary();
  const state = readPersistedState();
  const job = parseLogSnapshot(state);

  if (job.completedCount > lastPublishedCompleted && (job.completedCount - lastPublishedCompleted >= 25 || (!job.isRunning && job.completedCount > 0))) {
    lastPublishedCompleted = job.completedCount;
    publishGeneratedImagesToGit();
  }

  return {
    ...job,
    environment: {
      hasLocalPython: Boolean(pythonPath),
      pythonPath,
      hasUpscaylGpu: Boolean(upscaylPath),
      upscaylPath,
      deviceGpuTarget: "Intel Iris Xe / Vulkan Hardware Acceleration",
      coolingSafetyActive: true,
      belowNormalPriorityActive: true,
    },
  };
}

const queuedProductIds = new Set();

let drainTimer = null;

function scheduleQueueDrain() {
  if (drainTimer) return;
  drainTimer = setInterval(() => {
    if (queuedProductIds.size === 0) {
      clearInterval(drainTimer);
      drainTimer = null;
      return;
    }
    const existing = readPersistedState();
    if (existing?.pid && isPidAlive(existing.pid)) return;
    if (existing?.status === "stopping") {
      queuedProductIds.clear();
      clearInterval(drainTimer);
      drainTimer = null;
      return;
    }
    clearInterval(drainTimer);
    drainTimer = null;
    const nextIds = Array.from(queuedProductIds);
    queuedProductIds.clear();
    startGpuGeneration({ productIds: nextIds, count: nextIds.length, coolingDelay: 0.8 });
  }, 3000);
}

export function enqueueGpuRegeneration(productIds = []) {
  const cleanIds = (Array.isArray(productIds) ? productIds : String(productIds || "").split(","))
    .map((id) => String(id ?? "").trim())
    .filter((id) => /^\d{1,20}$/.test(id));
  if (!cleanIds.length) {
    return { ok: false, message: "No valid product IDs to regenerate" };
  }
  const existing = readPersistedState();
  if (existing?.pid && isPidAlive(existing.pid)) {
    for (const id of cleanIds) queuedProductIds.add(id);
    scheduleQueueDrain();
    return {
      ok: true,
      queued: true,
      queuedCount: queuedProductIds.size,
      message: `Добавлено в очередь на повторную генерацию: ${cleanIds.length}`,
    };
  }
  return startGpuGeneration({
    productIds: cleanIds,
    count: cleanIds.length,
    coolingDelay: 0.8,
  });
}

export function startGpuGeneration({ count = "all", productIds = null, coolingDelay = 0.8 } = {}) {
  const existing = readPersistedState();
  if (existing?.pid && isPidAlive(existing.pid)) {
    return {
      ok: false,
      message: "Генерация на GPU уже выполняется",
      job: getGpuGenerationStatus(),
    };
  }

  const pythonBin = resolvePythonBinary();
  const scriptPath = path.join(appDir, "scripts", "generate_product_images.py");

  const args = [scriptPath, "--local-gpu"];
  if (productIds && String(productIds).trim()) {
    const ids = Array.isArray(productIds) ? productIds.join(",") : String(productIds);
    args.push("--product-ids", ids);
  }
  if (count && count !== "all" && Number(count) > 0) {
    args.push("--max-images", String(Number(count)));
  } else {
    args.push("--max-images", "100000");
  }
  if (coolingDelay !== undefined) {
    args.push("--cooling-delay", String(coolingDelay));
  }

  const startedAt = new Date().toISOString();
  const targetCount = count === "all" ? "unlimited" : Number(count);
  lastPublishedCompleted = 0;

  try {
    fs.writeFileSync(LOG_FILE, "Запуск процесса генерации на локальной видеокарте...\n", "utf-8");
    const logFd = fs.openSync(LOG_FILE, "a");
    const child = spawn(pythonBin, args, {
      cwd: appDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    fs.closeSync(logFd);
    child.unref();

    writePersistedState({
      pid: child.pid,
      startedAt,
      finishedAt: null,
      targetCount,
      error: null,
    });
  } catch (err) {
    writePersistedState({
      pid: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      targetCount,
      error: err.message,
    });
    return { ok: false, error: err.message, job: getGpuGenerationStatus() };
  }

  return { ok: true, message: "Генерация на видеокарте запущена", job: getGpuGenerationStatus() };
}

export function stopGpuGeneration() {
  const existing = readPersistedState();
  if (!existing?.pid || !isPidAlive(existing.pid)) {
    if (existing) {
      writePersistedState({ ...existing, finishedAt: existing.finishedAt || new Date().toISOString() });
    }
    return { ok: true, message: "Процесс не был активен" };
  }

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(existing.pid), "/T", "/F"], { windowsHide: true });
    } else {
      process.kill(-existing.pid, "SIGTERM");
    }
  } catch {
    try {
      process.kill(existing.pid);
    } catch {}
  }

  writePersistedState({ ...existing, finishedAt: new Date().toISOString() });
  appendLogLine("Остановлено пользователем.");
  return { ok: true, message: "Запрос на остановку отправлен" };
}
