const baseUrl = (process.env.VERIFY_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const phone = process.env.VERIFY_TEACHER_PHONE ?? "13800000001";
const virtualUsers = positiveInteger("TRAINING_LOAD_VUS", 10);
const iterations = positiveInteger("TRAINING_LOAD_ITERATIONS", 5);
const allowedP95Ms = positiveInteger("TRAINING_LOAD_P95_MS", 1500);

const latencies = [];
const failures = [];

await Promise.all(
  Array.from({ length: virtualUsers }, (_, index) => runVirtualTeacher(index + 1)),
);

latencies.sort((left, right) => left - right);
const p95 = percentile(latencies, 0.95);
const summary = {
  virtualUsers,
  iterationsPerUser: iterations,
  requests: latencies.length,
  failures: failures.length,
  averageMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
  p95Ms: p95,
  allowedP95Ms,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length) {
  process.stderr.write(`${failures.slice(0, 10).join("\n")}\n`);
  process.exitCode = 1;
} else if (p95 > allowedP95Ms) {
  process.stderr.write(`Training read-path p95 ${p95} ms exceeded ${allowedP95Ms} ms.\n`);
  process.exitCode = 1;
}

async function runVirtualTeacher(worker) {
  const login = await request("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ role: "teacher", phone }),
    headers: { "Content-Type": "application/json" },
  }, worker);
  const token = login.data.token;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const home = await request("/teacher/training/home", { token }, worker);
    await Promise.all([
      request("/teacher/training/library", { token }, worker),
      request("/teacher/training/notifications", { token }, worker),
      home.data.enabled && home.data.assignment
        ? request("/teacher/training/current", { token }, worker)
        : Promise.resolve(),
    ]);
  }
}

async function request(path, options = {}, worker) {
  const started = performance.now();
  try {
    const headers = { ...(options.headers ?? {}) };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      body: options.body,
      headers,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.data === undefined) {
      throw new Error(`${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  } catch (error) {
    failures.push(`worker ${worker} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    latencies.push(Math.round(performance.now() - started));
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
