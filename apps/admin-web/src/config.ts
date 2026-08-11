const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
);

function normalizeApiBaseUrl(value: string | undefined) {
  const normalized = (value || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return normalized || DEFAULT_API_BASE_URL;
}
