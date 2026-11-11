with open("Al-Warda/scripts/generate_product_images.py", "rb") as f:
    content = f.read()

target = b"""    except WorkersDailyQuotaExceeded as error:
        job.update({"status": "failed", "error": str(error), "failedAt": utc_now().isoformat()})
        info[job_key] = job
        if account_pool and getattr(account_pool, "persist_quotas", False):
            info["imageGenerationAccountQuotas"] = account_pool.export_quotas()
        patch_stock(session, supabase_url, row, info)
        raise"""

replacement = b"""    except WorkersDailyQuotaExceeded as error:
        job.update({
            "status": "pending",
            "error": str(error),
            "updatedAt": utc_now().isoformat(),
        })
        job.pop("startedAt", None)
        info[job_key] = job
        if account_pool and getattr(account_pool, "persist_quotas", False):
            info["imageGenerationAccountQuotas"] = account_pool.export_quotas()
        patch_stock(session, supabase_url, row, info)
        raise"""

target_main = b"""        except WorkersDailyQuotaExceeded as error:
            failed += 1
            configuration_failure = True
            print(f"PROVIDER LIMIT: {error}. Batch stopped.", file=sys.stderr)
            break"""

replacement_main = b"""        except WorkersDailyQuotaExceeded as error:
            print(f"PROVIDER LIMIT: {error}. Item set to pending. Batch paused.", file=sys.stderr)
            break"""

content_norm = content.replace(b"\r\n", b"\n")
assert target in content_norm, "Target not found"
assert target_main in content_norm, "Target main not found"

content_norm = content_norm.replace(target, replacement)
content_norm = content_norm.replace(target_main, replacement_main)

with open("Al-Warda/scripts/generate_product_images.py", "wb") as f:
    f.write(content_norm.replace(b"\n", b"\r\n"))

print("Successfully updated generate_product_images.py")
