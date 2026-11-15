# Local AI Perfume Photography System — Setup Guide

This guide details the complete local developer environment setup for running Al-Warda's $0.00 API cost image enhancement and background removal pipeline.

---

## 1. Prerequisites

- **Operating System**: Windows 10/11 64-bit, macOS (Apple Silicon or Intel), or Linux (Ubuntu 20.04+).
- **Python**: Python 3.8+ (Python 3.10 or 3.11 recommended; Python 3.7+ supported with `onnxruntime` 1.14+).
- **Node.js**: Node 18+ (Node 20+ recommended).
- **RAM**: Minimum 8 GB (16+ GB recommended).
- **Disk Space**: At least 5 GB free for Python virtual environment, dependencies, and local ONNX models.

---

## 2. Python Environment Setup

Create and activate an isolated virtual environment:

```bash
# In the repository root
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# On Linux/macOS:
source .venv/bin/activate
```

Install core dependencies from `requirements.txt`:

```bash
pip install -r requirements.txt
```

Core dependencies installed:
- `onnxruntime` (Direct ML / CPU execution provider)
- `Pillow` (RGBA image composition, canvas layout)
- `numpy`, `scipy` (Numerical array transformations)
- `opencv-python-headless` (CLAHE, unsharp masking, bilateral filters)
- `requests`, `urllib3` (HTTP fetching of catalog assets)

---

## 3. Segmentation Model Download

The pipeline automatically fetches and verifies the `u2net.onnx` model (Apache 2.0 licence) on first run.

- **Storage Location**:
  - Windows: `%USERPROFILE%\.u2net\u2net.onnx`
  - Linux/macOS: `~/.u2net/u2net.onnx`
- **Expected SHA-256 Checksum**:
  `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`

To pre-download the model manually:
```bash
python Al-Warda/scripts/generate_product_images.py --check-schedule-ready
```

---

## 4. Running the Pipeline Locally

### A. Run 20 Product Evaluation Benchmark
```bash
python Al-Warda/scripts/evaluate_20_products.py
```
This tests 20 representative perfume items across categories (gold caps, dark bottles, transparent glass, Arabic typography, etc.) and logs metrics, saving output PNGs to `test-results/evaluation-20/`.

### B. Process the Catalog Queue
```bash
python Al-Warda/scripts/generate_product_images.py --max-images 50
```

### C. Regenerate Existing Images with New Studio Model
```bash
python Al-Warda/scripts/generate_product_images.py --max-images 50 --regenerate-completed
```

---

## 5. Running Automated Tests

Run the Python test suite:
```bash
python -m unittest Al-Warda/tests/test_product_image_generation.py
python -m unittest Al-Warda/tests/test_global_generation_halt.py
```

Run Node.js integration tests:
```bash
node --test Al-Warda/tests/productImageActions.test.js Al-Warda/tests/productImageQueueAdmin.test.js Al-Warda/tests/localProductImageActions.test.js
```

---

## 6. Frontend Build & Dev Server

Build the web application:
```bash
npm --prefix Al-Warda run build
```

Start the local development server:
```bash
npm --prefix Al-Warda run dev
```

Navigate to `http://localhost:5173/privileged` and select **Товары -> Генерация фото** to view the Local AI Photography Dashboard.
