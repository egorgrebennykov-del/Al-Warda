import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(appDir, "..");

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
      currentJob.logs.push("Новые сгенерированные фото автоматически отправлены на сайт (GitHub -> Cloudflare).");
      return { published: true };
    } catch (err) {
      currentJob.logs.push(`Предупреждение автопубликации Git: ${err.message}`);
      return { published: false, error: err.message };
    } finally {
      gitPublishInFlight = null;
    }
  })();
  return gitPublishInFlight;
}

let activeProcess = null;
let currentJob = {
  isRunning: false,
  mode: "local_gpu_upscayl",
  startedAt: null,
  finishedAt: null,
  totalCandidates: 0,
  targetCount: 0,
  completedCount: 0,
  failedCount: 0,
  currentProduct: null,
  lastImageUrl: null,
  lastLogLine: "",
  logs: [],
  error: null,
};

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

  // Verify if process is still running
  if (activeProcess && activeProcess.exitCode !== null) {
    currentJob.isRunning = false;
    currentJob.finishedAt = currentJob.finishedAt || new Date().toISOString();
    activeProcess = null;
  }

  return {
    ...currentJob,
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

export function startGpuGeneration({ count = "all", productIds = null, coolingDelay = 0.8 } = {}) {
  if (activeProcess && activeProcess.exitCode === null) {
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

  currentJob = {
    isRunning: true,
    mode: "local_gpu_upscayl",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalCandidates: 0,
    targetCount: count === "all" ? "unlimited" : Number(count),
    completedCount: 0,
    failedCount: 0,
    currentProduct: null,
    lastImageUrl: null,
    lastLogLine: "Запуск локального ИИ-пайплайна на GPU...",
    logs: ["Запуск процесса генерации на локальной видеокарте..."],
    error: null,
  };

  try {
    activeProcess = spawn(pythonBin, args, {
      cwd: appDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    });
  } catch (err) {
    currentJob.isRunning = false;
    currentJob.error = err.message;
    return { ok: false, error: err.message, job: currentJob };
  }

  const handleOutput = (data) => {
    const text = data.toString("utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      currentJob.lastLogLine = line;
      currentJob.logs.push(line);
      if (currentJob.logs.length > 200) currentJob.logs.shift();

      if (line.includes("Targeting") && line.includes("specific product")) {
        const m = line.match(/Targeting (\d+)/);
        if (m) currentJob.totalCandidates = parseInt(m[1], 10);
      } else if (line.includes("Queue:") && line.includes("eligible")) {
        const m = line.match(/Queue:\s*(\d+)/);
        if (m) currentJob.totalCandidates = parseInt(m[1], 10);
      }

      if (line.startsWith("COMPLETED ")) {
        currentJob.completedCount++;
        const parts = line.split(" ");
        if (parts[2]) currentJob.lastImageUrl = parts[2].trim();
        currentJob.currentProduct = null;
        if (currentJob.completedCount % 25 === 0) {
          publishGeneratedImagesToGit();
        }
      } else if (line.startsWith("DESCRIBED ") || line.includes("Processing ")) {
        currentJob.currentProduct = line;
      } else if (line.includes("AI Super-Resolution succeeded:")) {
        currentJob.lastLogLine = line;
      }
    }
  };

  activeProcess.stdout.on("data", handleOutput);
  activeProcess.stderr.on("data", handleOutput);

  activeProcess.on("close", (code) => {
    currentJob.isRunning = false;
    currentJob.finishedAt = new Date().toISOString();
    activeProcess = null;
    const finalMsg = code === 0
      ? `Генерация успешно завершена! Обработано: ${currentJob.completedCount} фото.`
      : `Процесс завершился с кодом ${code}.`;
    currentJob.logs.push(finalMsg);
    currentJob.lastLogLine = finalMsg;
    if (currentJob.completedCount > 0) {
      publishGeneratedImagesToGit();
    }
  });

  activeProcess.on("error", (err) => {
    currentJob.isRunning = false;
    currentJob.error = err.message;
    currentJob.logs.push(`Ошибка процесса: ${err.message}`);
    activeProcess = null;
  });

  return { ok: true, message: "Генерация на видеокарте запущена", job: currentJob };
}

export function stopGpuGeneration() {
  if (!activeProcess || activeProcess.exitCode !== null) {
    currentJob.isRunning = false;
    return { ok: true, message: "Процесс не был активен" };
  }

  try {
    // Graceful stop on Windows via taskkill tree
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(activeProcess.pid), "/T", "/F"]);
    } else {
      activeProcess.kill("SIGTERM");
    }
  } catch (err) {
    try {
      activeProcess.kill();
    } catch {}
  }

  currentJob.isRunning = false;
  currentJob.finishedAt = new Date().toISOString();
  currentJob.logs.push("Процесс генерации был остановлен администратором.");
  currentJob.lastLogLine = "Остановлено пользователем.";
  activeProcess = null;
  if (currentJob.completedCount > 0) {
    publishGeneratedImagesToGit();
  }

  return { ok: true, message: "Генерация на видеокарте остановлена" };
}
