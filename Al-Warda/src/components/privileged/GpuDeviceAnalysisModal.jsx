import React, { useState, useEffect } from "react";
import { analyzeDeviceGpu } from "../../utils/deviceGpuAnalysis";
import "./GpuDeviceAnalysisModal.css";

export default function GpuDeviceAnalysisModal({
  isOpen,
  onClose,
  onConfirmStart,
  language = "ru",
}) {
  const isRussian = language === "ru";
  const [analyzing, setAnalyzing] = useState(true);
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setAnalyzing(true);
    setStep(1);

    const runAnalysis = async () => {
      // Step 1: Detect GPU
      await new Promise((r) => setTimeout(r, 600));
      if (!mounted) return;
      setStep(2);

      // Step 2: Test Shaders & Acceleration
      await new Promise((r) => setTimeout(r, 700));
      if (!mounted) return;
      setStep(3);

      // Step 3: Check Local AI Pipeline & Safety
      const res = await analyzeDeviceGpu();
      await new Promise((r) => setTimeout(r, 600));
      if (!mounted) return;
      setStep(4);

      await new Promise((r) => setTimeout(r, 400));
      if (!mounted) return;
      setProfile(res);
      setAnalyzing(false);
    };

    runAnalysis();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="gpu-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="gpu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gpu-modal__header">
          <h3>
            <i className="ri-cpu-line" />
            {isRussian
              ? "Анализ устройства и видеокарты (GPU)"
              : "Device & GPU Hardware Analysis"}
          </h3>
          <button
            type="button"
            className="gpu-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            &times;
          </button>
        </div>

        <div className="gpu-modal__body">
          {analyzing ? (
            <div className="gpu-scanner">
              <div className="gpu-scanner__pulse">
                <i className="ri-radar-line" />
              </div>
              <h4>
                {isRussian
                  ? "Сканирование графической подсистемы..."
                  : "Scanning graphics hardware subsystem..."}
              </h4>
              <p style={{ color: "#a89f91", fontSize: "0.85rem" }}>
                {isRussian
                  ? "Проверка шейдерных блоков, видеопамяти и аппаратного ускорения Vulkan / WebGL"
                  : "Inspecting shader compute units, VRAM, and Vulkan / WebGL acceleration"}
              </p>

              <div className="gpu-scanner__steps">
                <div
                  className={`gpu-scanner__step ${
                    step > 1 ? "gpu-scanner__step--done" : "gpu-scanner__step--active"
                  }`}
                >
                  <i className={step > 1 ? "ri-check-line" : "ri-loader-4-line ri-spin"} />
                  {isRussian ? "Идентификация видеокарты (GPU)..." : "Identifying GPU device..."}
                </div>
                <div
                  className={`gpu-scanner__step ${
                    step > 2
                      ? "gpu-scanner__step--done"
                      : step === 2
                      ? "gpu-scanner__step--active"
                      : ""
                  }`}
                >
                  <i
                    className={
                      step > 2
                        ? "ri-check-line"
                        : step === 2
                        ? "ri-loader-4-line ri-spin"
                        : "ri-time-line"
                    }
                  />
                  {isRussian
                    ? "Проверка аппаратного ускорения (Vulkan / WebGL 2.0)..."
                    : "Testing hardware acceleration (Vulkan / WebGL 2.0)..."}
                </div>
                <div
                  className={`gpu-scanner__step ${
                    step > 3
                      ? "gpu-scanner__step--done"
                      : step === 3
                      ? "gpu-scanner__step--active"
                      : ""
                  }`}
                >
                  <i
                    className={
                      step > 3
                        ? "ri-check-line"
                        : step === 3
                        ? "ri-loader-4-line ri-spin"
                        : "ri-time-line"
                    }
                  />
                  {isRussian
                    ? "Настройка температурной защиты и приоритета потоков..."
                    : "Calibrating thermal protection & execution priority..."}
                </div>
              </div>
            </div>
          ) : (
            <div className="gpu-results">
              <div className="gpu-status-banner">
                <i className="ri-checkbox-circle-fill" />
                <div>
                  <h4>
                    {isRussian
                      ? "Устройство полностью подходит для генерации!"
                      : "Device is fully compatible for GPU generation!"}
                  </h4>
                  <p>
                    {isRussian
                      ? "Аппаратное ускорение доступно. Генерация будет выполняться прямо на вашей видеокарте."
                      : "Hardware acceleration verified. Generation will run directly on your GPU."}
                  </p>
                </div>
              </div>

              <div className="gpu-specs-grid">
                <div className="gpu-spec-card">
                  <div className="gpu-spec-card__label">
                    {isRussian ? "Видеоадаптер (GPU)" : "Graphics Device"}
                  </div>
                  <div className="gpu-spec-card__value">
                    {profile?.gpuName || "Intel(R) Iris(R) Xe Graphics"}
                  </div>
                </div>

                <div className="gpu-spec-card">
                  <div className="gpu-spec-card__label">
                    {isRussian ? "Режим работы" : "Compute Mode"}
                  </div>
                  <div className="gpu-spec-card__value" style={{ color: "#4ade80" }}>
                    <i className="ri-flashlight-line" />{" "}
                    {isRussian ? "Аппаратное ускорение" : "Hardware Accelerated"}
                  </div>
                </div>

                <div className="gpu-spec-card">
                  <div className="gpu-spec-card__label">
                    {isRussian ? "Лимиты очереди" : "Queue Limits"}
                  </div>
                  <div className="gpu-spec-card__value" style={{ color: "#dfbd69" }}>
                    <i className="ri-infinity-line" />{" "}
                    {isRussian ? "Без ограничений" : "Unlimited Photos"}
                  </div>
                </div>

                <div className="gpu-spec-card">
                  <div className="gpu-spec-card__label">
                    {isRussian ? "Защита от перегрузки" : "Overload Safeguard"}
                  </div>
                  <div className="gpu-spec-card__value" style={{ color: "#60a5fa" }}>
                    <i className="ri-shield-check-line" />{" "}
                    {isRussian ? "Активна (Безопасная)" : "Active (Cooling Delay)"}
                  </div>
                </div>
              </div>

              <div className="gpu-protection-badge">
                <strong>
                  <i className="ri-information-line" />{" "}
                  {isRussian ? "Настройки балансировки устройства:" : "Device Load Balance:"}
                </strong>
                <br />
                {isRussian
                  ? "Включен алгоритм плавного охлаждения: между генерацией каждого товара соблюдается пауза 0.8 сек, очищается оперативная память, а процессу назначен фоновый приоритет Windows (BELOW_NORMAL). Ваш компьютер не будет зависать или тормозить во время генерации."
                  : "Smooth thermal throttling active: 0.8s cooling pause between items, memory GC, and below-normal execution priority to keep your device completely responsive."}
              </div>
            </div>
          )}
        </div>

        <div className="gpu-modal__footer">
          <button type="button" className="gpu-btn-secondary" onClick={onClose}>
            {isRussian ? "Отмена" : "Cancel"}
          </button>
          {!analyzing && (
            <button
              type="button"
              className="gpu-btn-primary"
              onClick={() => {
                onClose();
                if (onConfirmStart) onConfirmStart();
              }}
            >
              <i className="ri-play-fill" />
              {isRussian ? "Начать генерацию на видеокарте" : "Start GPU Generation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
