# Hardware Requirements — Al-Warda Local AI Pipeline

This document specifies the hardware configurations required to run the local AI photography pipeline.

---

## 1. Specifications Overview

| Hardware Component | Minimum Requirement | Recommended Specification | Production Server / Workstation |
| :--- | :--- | :--- | :--- |
| **Processor (CPU)** | Intel Core i3 (8th Gen+) / AMD Ryzen 3 / Apple M1 | Intel Core i7 / AMD Ryzen 7 (8+ threads) | Intel Xeon / AMD Threadripper (16+ cores) |
| **System RAM** | 8 GB RAM | 16 GB RAM | 32+ GB RAM |
| **Graphics (GPU)** | Not required (CPU only) | Intel Iris Xe / AMD Radeon Integrated | NVIDIA RTX 3060+ (CUDA/DirectML) |
| **Disk Storage** | 5 GB free SSD space | 15 GB free NVMe SSD | 50+ GB free NVMe SSD |
| **Network** | 10 Mbps broadband | 50+ Mbps broadband | 100+ Mbps datacenter uplink |
| **Operating System** | Windows 10/11 64-bit, macOS 12+, Ubuntu 20.04+ | Windows 11 64-bit, macOS 14+, Ubuntu 24.04 LTS | Ubuntu 22.04/24.04 LTS |

---

## 2. Benchmark on Test System

- **Host Machine**: Windows 11 Home 64-bit
- **CPU**: 11th Gen Intel Core i7-1165G7 @ 2.80GHz (4 cores, 8 threads)
- **RAM**: 32 GB DDR4
- **GPU**: Intel Iris Xe Graphics (Integrated)
- **Execution Provider**: `onnxruntime` CPUExecutionProvider (4 threads)
- **Observed Throughput**:
  - **1.54 seconds per product photo** (1024×1024 RGBA).
  - **Full catalog processing (2000+ items)**: **~51.4 minutes**.
  - **RAM Peak Consumption**: ~240 MB during inference.
  - **VRAM Required**: 0 MB (No discrete GPU needed).

---

## 3. Scaling & Acceleration

- **Multi-threading**: `onnxruntime` is configured with `intra_op_num_threads = 4` and `inter_op_num_threads = 4`.
- **DirectML Support**: On Windows systems with modern GPUs, `DirectMLExecutionProvider` can optionally be enabled to achieve sub-second speeds (~0.6s per image).
- **Zero API Incurred Cost**: Runs entirely on the host machine with $0.00 cloud API expenses.
