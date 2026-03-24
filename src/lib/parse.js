const KV_PATTERN = /([a-zA-Z0-9\-\s]+):\s*([^:\s]+)/g;
const FILE_PATH_PATTERN = /\/data\/[A-Za-z0-9_\-./ ()]+?\.(?:gcode|3mf|fpp|gx|g)/g;
const PROGRESS_PATTERN = /(\d+)\/(\d+)/g;

function parseInlinePairs(input) {
  const values = {};
  for (const match of input.matchAll(KV_PATTERN)) {
    values[match[1].trimStart()] = match[2];
  }
  return values;
}

export function parseKvResponse(content) {
  const values = {};
  const lines = content.split(/\r?\n/).slice(1);

  for (const line of lines) {
    if (line === "ok") {
      return values;
    }

    const splitIndex = line.indexOf(":");
    if (splitIndex === -1) {
      continue;
    }

    const key = line.slice(0, splitIndex);
    const value = line.slice(splitIndex + 1).trimStart();

    if (key === "X" || key === "T0") {
      Object.assign(values, parseInlinePairs(line));
      continue;
    }

    if (key === "Endstop") {
      Object.assign(values, parseInlinePairs(value));
      continue;
    }

    values[key] = value;
  }

  return values;
}

export function parseFilesResponse(content) {
  const files = [...content.matchAll(FILE_PATH_PATTERN)].map((match) => ({
    name: match[0],
    isActive: false,
  }));

  // Preserve printer-provided order (typically newest first) and remove duplicates.
  const seen = new Set();
  const deduped = [];
  for (const file of files) {
    if (seen.has(file.name)) continue;
    seen.add(file.name);
    deduped.push(file);
  }
  return deduped;
}

export function parseProgressResponse(content) {
  const pairs = [...content.matchAll(PROGRESS_PATTERN)].map((match) => [Number(match[1]), Number(match[2])]);
  if (pairs.length < 2) {
    throw new Error("unable to parse printer progress");
  }
  return {
    byte: pairs[0],
    layer: pairs[1],
  };
}
