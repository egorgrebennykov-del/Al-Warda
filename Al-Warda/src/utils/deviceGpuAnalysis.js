/**
 * deviceGpuAnalysis.js — аппаратный анализ видеокарты и профилирование устройства
 * для безопасной локальной генерации изображений без перегрузки системы.
 */

const STORAGE_KEY = "alwarda_device_gpu_profile_v1";

/**
 * Получить сохраненный профиль устройства из localStorage
 */
export function getSavedDeviceProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.analyzedAt) return parsed;
  } catch {}
  return null;
}

/**
 * Очистить профиль устройства для повторного анализа
 */
export function clearSavedDeviceProfile() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Выполнить углубленный аппаратный анализ видеокарты и возможностей устройства
 */
export async function analyzeDeviceGpu() {
  const result = {
    analyzedAt: new Date().toISOString(),
    isCompatible: false,
    gpuName: "Неизвестный видеоадаптер",
    vendor: "Unknown",
    renderer: "Unknown",
    webgl2: false,
    webgpu: false,
    maxTextureSize: 0,
    cores: navigator.hardwareConcurrency || 4,
    ramEstimateGb: navigator.deviceMemory || 8,
    localRunnerAvailable: false,
    localRunnerUrl: null,
    upscaylGpuSupported: true,
    throttlingProtection: {
      active: true,
      coolingDelaySec: 0.8,
      priority: "BELOW_NORMAL (Windows Background Priority)",
      singleThreadVulkan: true,
    },
    benchmarks: {},
    warnings: [],
  };

  // 1. Определение GPU через WebGL 2.0 / 1.0
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");

    if (gl) {
      result.webgl2 = Boolean(canvas.getContext("webgl2"));
      result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        result.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
        result.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
      } else {
        result.vendor = gl.getParameter(gl.VENDOR) || "";
        result.renderer = gl.getParameter(gl.RENDERER) || "";
      }

      // Очистка названия видеокарты для красивого отображения
      let cleanGpu = result.renderer;
      cleanGpu = cleanGpu.replace(/ANGLE \(([^,]+), ([^,]+).*\)/, "$2 ($1)");
      cleanGpu = cleanGpu.replace(/Direct3D.*$/, "").trim();
      cleanGpu = cleanGpu.replace(/vs_\S+ ps_\S+/, "").trim();
      if (!cleanGpu || cleanGpu.toLowerCase().includes("generic")) {
        cleanGpu = result.vendor || "Аппаратный GPU адаптер";
      }
      result.gpuName = cleanGpu;

      // Проверка на программный рендерер (SwiftShader / llvmpipe)
      const lower = result.renderer.toLowerCase();
      const isSoftware =
        lower.includes("swiftshader") ||
        lower.includes("software") ||
        lower.includes("llvmpipe") ||
        lower.includes("basic render");

      if (isSoftware) {
        result.warnings.push(
          "Обнаружен программный рендерер без прямого аппаратного ускорения видеокарты.",
        );
      } else {
        result.isCompatible = true;
      }
    }
  } catch (err) {
    result.warnings.push(`Ошибка WebGL инспекции: ${err.message}`);
  }

  // 2. Проверка WebGPU
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        result.webgpu = true;
        if (adapter.info) {
          result.gpuName = adapter.info.device || adapter.info.description || result.gpuName;
        }
      }
    } catch {}
  }

  // 3. Проверка доступности локального сервиса генерации
  const endpoints = [
    "/api/admin/gpu-generation/status",
    "http://localhost:5000/api/admin/gpu-generation/status",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.environment?.hasLocalPython) {
          result.localRunnerAvailable = true;
          result.localRunnerUrl = url.replace("/status", "");
          if (data.environment.deviceGpuTarget) {
            result.gpuTarget = data.environment.deviceGpuTarget;
          }
          break;
        }
      }
    } catch {}
  }

  // Устройство всегда совместимо, если есть GPU или доступен локальный раннер
  if (result.maxTextureSize >= 4096 || result.webgl2 || result.localRunnerAvailable) {
    result.isCompatible = true;
  }

  // Сохраняем профиль
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {}

  return result;
}
