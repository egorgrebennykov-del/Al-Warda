import re
path = "Al-Warda/utils/perfumes.js"
raw = open(path, "rb").read().decode("utf-8")
t = raw.replace("\r\n", "\n")

def rep(old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, f"{n} occurrences of: {old[:80]}"
    t = t.replace(old, new)

# ensurePerfumeEnrichment
rep('''  const explicitVolFromName = extractVolumeFromName(name);
  const rawVol = p.volume || p.info?.volume;
  let resolvedVolume = explicitVolFromName;
  if (!resolvedVolume) {
    resolvedVolume = rawVol ? String(rawVol).trim() : "100 мл / 3.4 FL.OZ.";
  }
''', '''  // Real size only: parsed from the original Qogita title/description, never a 100 ml placeholder.
  const resolvedVolume = resolvePerfumeVolume({ ...p, name });
''')

# Supabase mapping
rep('''            volume: extractVolumeFromName(rawPerfumeName, info.volume || r.volume || "100 мл / 3.4 FL.OZ."),''',
    '''            rawName: rawPerfumeName,
            rawDescription: r.description || "",
            volume: resolvePerfumeVolume({ rawName: rawPerfumeName, rawDescription: r.description, volume: r.volume, info }),''')

# parseVolumeMl -> shared parser
rep('''  const str = String(val);
  const multMatch = str.match(/(\\d+)\\s*[xX×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:ml|мл)/i);
  if (multMatch) return parseFloat(multMatch[2].replace(",", "."));
  const match = str.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:ml|мл)/i);
  if (match) return parseFloat(match[1].replace(",", "."));
  const ozMatch = str.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:fl\\.?\\s*oz)/i);
  if (ozMatch) {
    let ozVal = parseFloat(ozMatch[1].replace(",", "."));
    if (ozVal === 34) ozVal = 3.4;
    return Math.round(ozVal * 29.5735);
  }
''', '''  const str = String(val);
  const parsed = parseVolumeFromText(str);
  if (parsed) {
    const multMatch = parsed.match(/×\\s*(\\d+(?:\\.\\d+)?)\\s*мл/);
    if (multMatch) return parseFloat(multMatch[1]);
    const mlMatch = parsed.match(/^(\\d+(?:\\.\\d+)?)\\s*(?:мл|г)/);
    if (mlMatch) return parseFloat(mlMatch[1]);
  }
''')

# Volume option labels: never print an invented "100 мл" when the size is unknown
rep('''  const bottleMl = parseVolumeMl(perfume.name) || parseVolumeMl(perfume.volume) || 100;
  if (!optionsMap.has(bottleMl)) {
    const rawBottleLabel = (perfume.volume && parseVolumeMl(perfume.volume) === bottleMl)
      ? perfume.volume.split("/")[0].trim()
      : `${bottleMl} мл`;''', '''  const knownBottleMl = parseVolumeMl(perfume.volume) || parseVolumeMl(perfume.name);
  const bottleMl = knownBottleMl || 100;
  if (!optionsMap.has(bottleMl)) {
    const rawBottleLabel = perfume.volume
      ? perfume.volume.split("/")[0].trim()
      : (knownBottleMl ? `${bottleMl} мл` : "");''')
rep('''  const bottleMl = parseVolumeMl(perfume.name) || parseVolumeMl(perfume.volume) || 100;
  const rawBottleLabel = (perfume.volume && parseVolumeMl(perfume.volume) === bottleMl)
    ? perfume.volume.split("/")[0].trim()
    : `${bottleMl} мл`;''', '''  const knownBottleMl = parseVolumeMl(perfume.volume) || parseVolumeMl(perfume.name);
  const bottleMl = knownBottleMl || 100;
  const rawBottleLabel = perfume.volume
    ? perfume.volume.split("/")[0].trim()
    : (knownBottleMl ? `${bottleMl} мл` : "");''')

open(path, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
print("ok")
