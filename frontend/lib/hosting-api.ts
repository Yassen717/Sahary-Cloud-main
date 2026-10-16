import { apiClient, ApiError, API_URL } from "./api";
import { getCsrfToken } from "./security";
import type {
  AdminHostingAccountDTO,
  AdminHostingAccountDetailDTO,
  AdminHostingPlanDTO,
  AdminHostingStatsDTO,
  CheckoutSessionDTO,
  FileEntryDTO,
  FileListDTO,
  HostingAccountDTO,
  HostingCredentialRevealDTO,
  HostingDatabaseDTO,
  HostingDatabasesDTO,
  HostingDomainDTO,
  HostingFtpDTO,
  HostingPlanDTO,
  HostingUsageDTO,
  Paginated,
  PortalSessionDTO,
  SubscriptionStatusDTO,
} from "./hosting-types";

// Backend JSON envelope: { success, data, message? }
interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

async function requestData<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await apiClient.request<Envelope<T>>(endpoint, options);
  return res.data;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

/* Plans & account */

export function getPlans(): Promise<HostingPlanDTO[]> {
  return requestData("/hosting/plans");
}

export async function getMyAccount(): Promise<HostingAccountDTO | null> {
  try {
    return await requestData("/hosting/accounts/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// Dev/test escape hatch — the backend answers 402 unless HOSTING_ALLOW_UNPAID_ACCOUNTS.
export function createAccountDev(
  planId: string,
  domain?: string,
): Promise<HostingAccountDTO> {
  return requestData(
    "/hosting/accounts",
    json("POST", { planId, ...(domain ? { domain } : {}) }),
  );
}

export function terminateAccount(id: string): Promise<HostingAccountDTO> {
  return requestData(`/hosting/accounts/${id}`, { method: "DELETE" });
}

/* Domains */

export function listDomains(): Promise<HostingDomainDTO[]> {
  return requestData("/hosting/domains");
}

export function addDomain(domain: string): Promise<HostingDomainDTO> {
  return requestData("/hosting/domains", json("POST", { domain }));
}

export function verifyDomain(id: string): Promise<HostingDomainDTO> {
  return requestData(`/hosting/domains/${id}/verify`, { method: "POST" });
}

export function removeDomain(id: string): Promise<{ removed: boolean }> {
  return requestData(`/hosting/domains/${id}`, { method: "DELETE" });
}

export function issueDomainSsl(id: string): Promise<HostingDomainDTO> {
  return requestData(`/hosting/domains/${id}/ssl`, { method: "POST" });
}

/* Files */

export function listFiles(path: string): Promise<FileListDTO> {
  return requestData(`/hosting/files?path=${encodeURIComponent(path)}`);
}

interface UploadResult {
  uploaded: Array<{ name: string; size: number }>;
}

export interface UploadFilesOptions {
  overwrite?: boolean;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

function uploadFilesOnce(
  path: string,
  files: File[],
  opts?: UploadFilesOptions,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query =
      `path=${encodeURIComponent(path)}` +
      (opts?.overwrite ? "&overwrite=true" : "");
    xhr.open("POST", `${API_URL}/hosting/files/upload?${query}`);
    xhr.withCredentials = true;

    const token = apiClient.getToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    const csrf = getCsrfToken();
    if (csrf) {
      xhr.setRequestHeader("X-CSRF-Token", csrf);
    }

    const onAbort = () => {
      xhr.abort();
      reject(new ApiError("Upload aborted", 0));
    };
    if (opts?.signal) {
      if (opts.signal.aborted) {
        reject(new ApiError("Upload aborted", 0));
        return;
      }
      opts.signal.addEventListener("abort", onAbort);
    }
    const cleanup = () => opts?.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      cleanup();
      const body = parseJsonSafe(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && body?.success !== false) {
        resolve((body?.data as UploadResult) ?? { uploaded: [] });
        return;
      }
      reject(
        new ApiError(
          (body?.message as string | undefined) ?? `HTTP ${xhr.status}`,
          xhr.status,
        ),
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError("Network error during upload", 0));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError("Upload aborted", 0));
    };

    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    xhr.send(form);
  });
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function uploadFiles(
  path: string,
  files: File[],
  opts?: UploadFilesOptions,
): Promise<UploadResult> {
  try {
    return await uploadFilesOnce(path, files, opts);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !opts?.signal?.aborted &&
      (await apiClient.refreshSession())
    ) {
      return uploadFilesOnce(path, files, opts);
    }
    throw err;
  }
}

export function makeDirectory(
  path: string,
  name: string,
): Promise<FileEntryDTO> {
  return requestData("/hosting/files/mkdir", json("POST", { path, name }));
}

export function renameFile(from: string, to: string): Promise<FileEntryDTO> {
  return requestData("/hosting/files/rename", json("POST", { from, to }));
}

export function deleteFiles(paths: string[]): Promise<{ deleted: number }> {
  return requestData("/hosting/files", json("DELETE", { paths }));
}

export function fileDownloadUrl(path: string): string {
  return `${API_URL}/hosting/files/download?path=${encodeURIComponent(path)}`;
}

export function readTextFile(
  path: string,
): Promise<{ path: string; content: string; size: number }> {
  return requestData(
    `/hosting/files/content?path=${encodeURIComponent(path)}`,
  );
}

export function writeTextFile(
  path: string,
  content: string,
): Promise<FileEntryDTO> {
  return requestData("/hosting/files/content", json("PUT", { path, content }));
}

/* Databases */

export function getDatabases(): Promise<HostingDatabasesDTO> {
  return requestData("/hosting/databases");
}

export function createDatabase(name?: string): Promise<HostingDatabaseDTO> {
  return requestData(
    "/hosting/databases",
    json("POST", name ? { name } : {}),
  );
}

export function deleteDatabase(id: string): Promise<{ deleted: boolean }> {
  return requestData(`/hosting/databases/${id}`, { method: "DELETE" });
}

export function resetDatabasePassword(): Promise<HostingCredentialRevealDTO> {
  return requestData("/hosting/databases/reset-password", { method: "POST" });
}

/* FTP */

export function getFtp(): Promise<HostingFtpDTO> {
  return requestData("/hosting/ftp");
}

export function resetFtpPassword(): Promise<HostingCredentialRevealDTO> {
  return requestData("/hosting/ftp/reset-password", { method: "POST" });
}

/* Usage */

export function getUsage(): Promise<HostingUsageDTO> {
  return requestData("/hosting/usage");
}

/* Subscription & billing */

export function subscribe(
  planId: string,
  domain?: string,
): Promise<CheckoutSessionDTO> {
  return requestData(
    "/hosting/plans/subscribe",
    json("POST", { planId, ...(domain ? { domain } : {}) }),
  );
}

export function changePlan(planId: string): Promise<SubscriptionStatusDTO> {
  return requestData("/hosting/plans/change", json("POST", { planId }));
}

export function cancelSubscription(): Promise<SubscriptionStatusDTO> {
  return requestData("/hosting/plans/cancel", { method: "DELETE" });
}

export function resumeSubscription(): Promise<SubscriptionStatusDTO> {
  return requestData("/hosting/plans/resume", { method: "POST" });
}

export function openBillingPortal(): Promise<PortalSessionDTO> {
  return requestData("/hosting/plans/portal", { method: "POST" });
}

export function getSubscription(): Promise<SubscriptionStatusDTO> {
  return requestData("/hosting/plans/subscription");
}

/* Admin */

export interface AdminListAccountsParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function adminListAccounts(
  params: AdminListAccountsParams = {},
): Promise<Paginated<AdminHostingAccountDTO>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return requestData(`/admin/hosting/accounts${query ? `?${query}` : ""}`);
}

export function adminGetAccount(
  id: string,
): Promise<AdminHostingAccountDetailDTO> {
  return requestData(`/admin/hosting/accounts/${id}`);
}

export function adminSuspend(
  id: string,
  note?: string,
): Promise<AdminHostingAccountDetailDTO> {
  return requestData(
    `/admin/hosting/accounts/${id}/suspend`,
    json("POST", note ? { note } : {}),
  );
}

export function adminActivate(
  id: string,
): Promise<AdminHostingAccountDetailDTO> {
  return requestData(`/admin/hosting/accounts/${id}/activate`, {
    method: "POST",
  });
}

export function adminRetryProvisioning(
  id: string,
): Promise<AdminHostingAccountDetailDTO> {
  return requestData(`/admin/hosting/accounts/${id}/retry-provisioning`, {
    method: "POST",
  });
}

export function adminTerminate(
  id: string,
): Promise<AdminHostingAccountDetailDTO> {
  return requestData(`/admin/hosting/accounts/${id}`, { method: "DELETE" });
}

export function adminStats(): Promise<AdminHostingStatsDTO> {
  return requestData("/admin/hosting/stats");
}

export function adminListPlans(): Promise<AdminHostingPlanDTO[]> {
  return requestData("/admin/hosting/plans");
}

export type AdminUpdatePlanPatch = Partial<
  Pick<
    AdminHostingPlanDTO,
    | "description"
    | "monthlyPrice"
    | "diskGB"
    | "bandwidthGB"
    | "maxDomains"
    | "maxDatabases"
    | "maxFtpAccounts"
    | "isActive"
  >
>;

export function adminUpdatePlan(
  id: string,
  patch: AdminUpdatePlanPatch,
): Promise<AdminHostingPlanDTO> {
  return requestData(`/admin/hosting/plans/${id}`, json("PUT", patch));
}
