export async function apiRequest<T>(
  endpoint: string,
  body: unknown
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }));
      return { data: null, error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    console.error("API request error:", err);
    return { data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
