import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request, tokenStore, WORKSPACE_HEADER, workspaceStore } from "@/api/client";

function mockFetch(status: number, body: unknown, contentType = "application/json") {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "status",
    headers: new Headers({ "content-type": contentType }),
    text: () => Promise.resolve(text),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api client", () => {
  beforeEach(() => {
    tokenStore.clear();
    workspaceStore.set(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the bearer token and JSON body, and parses the response", async () => {
    tokenStore.set("tok123");
    const fetchMock = mockFetch(201, { id: 1 });
    const result = await request<{ id: number }>("/api/v1/clients/", { method: "POST", body: { name: "A" }, query: { page: 2, empty: "" } });
    expect(result).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/clients/?page=2");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "A" }));
  });

  it("maps backend {error, detail} bodies to ApiError", async () => {
    mockFetch(409, { error: "CONFLICT", detail: "A client with email 'x' already exists." });
    await expect(request("/api/v1/clients/", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "CONFLICT",
      message: "A client with email 'x' already exists.",
    } satisfies Partial<ApiError>);
  });

  it("flattens FastAPI 422 validation errors into one message", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "gstin"], msg: "Value error, GSTIN check character is invalid.", type: "value_error" }] });
    await expect(request("/x", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "gstin: GSTIN check character is invalid.",
    });
  });

  it("dispatches auth:expired on 401 and returns undefined on 204", async () => {
    const handler = vi.fn();
    window.addEventListener("auth:expired", handler);
    mockFetch(401, { error: "INVALID_TOKEN", detail: "expired" });
    await expect(request("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:expired", handler);

    mockFetch(204, undefined);
    await expect(request("/api/v1/invoices/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("refreshes once on 401 and retries the original request", async () => {
    tokenStore.set("old-access", "refresh-1");
    const handler = vi.fn();
    window.addEventListener("auth:expired", handler);
    const json = (status: number, body: unknown) => ({
      ok: status < 300, status, statusText: "s", headers: new Headers(), text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: "INVALID_TOKEN", detail: "expired" }))
      .mockResolvedValueOnce(json(200, { access_token: "new-access", refresh_token: "refresh-2" }))
      .mockResolvedValueOnce(json(200, { id: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/v1/auth/me")).resolves.toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh_token: "refresh-1" });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer new-access");
    expect(tokenStore.get()).toBe("new-access");
    expect(tokenStore.getRefresh()).toBe("refresh-2");
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener("auth:expired", handler);
  });

  it("logs out when the refresh itself fails, and never loops", async () => {
    tokenStore.set("old-access", "refresh-dead");
    const handler = vi.fn();
    window.addEventListener("auth:expired", handler);
    const fetchMock = mockFetch(401, { error: "INVALID_TOKEN", detail: "expired" });
    await expect(request("/api/v1/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + one refresh attempt
    expect(handler).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
    window.removeEventListener("auth:expired", handler);
  });

  it("sends X-Workspace-Id only while an admin has switched workspace", async () => {
    tokenStore.set("tok");
    workspaceStore.set(42);
    let fetchMock = mockFetch(200, []);
    await request("/api/v1/clients/");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ [WORKSPACE_HEADER]: "42" });

    workspaceStore.set(null);
    fetchMock = mockFetch(200, []);
    await request("/api/v1/clients/");
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers[WORKSPACE_HEADER]).toBeUndefined();
  });
});
