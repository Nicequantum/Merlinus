import type { RepairOrder, StructuredROExtraction, TechnicianSession } from '@/types';

export interface TechnicianUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  consentAt?: string | null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed. Please try again.');
  }

  return res.json();
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Upload failed. Please try again.');
  }

  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ session: TechnicianSession }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ session: TechnicianSession | null }>('/api/auth/me'),

  acceptConsent: () => apiFetch<{ consentAt: string }>('/api/consent', { method: 'POST' }),

  listRepairOrders: () => apiFetch<{ repairOrders: RepairOrder[] }>('/api/repair-orders'),

  getRepairOrder: (id: string) => apiFetch<{ repairOrder: RepairOrder }>(`/api/repair-orders/${id}`),

  createRepairOrder: (data: Partial<RepairOrder> & { fromExtraction?: boolean; customerName?: string }) =>
    apiFetch<{ repairOrder: RepairOrder }>('/api/repair-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRepairOrder: (id: string, data: Partial<RepairOrder>) =>
    apiFetch<{ repairOrder: RepairOrder }>(`/api/repair-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRepairOrder: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/repair-orders/${id}`, { method: 'DELETE' }),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload<{ url: string; name: string }>('/api/upload', formData);
  },

  extractRO: (imageUrls: string[]) =>
    apiFetch<StructuredROExtraction>('/api/repair-orders/extract', {
      method: 'POST',
      body: JSON.stringify({ imageUrls }),
    }),

  generateStory: (roId: string, lineId: string) =>
    apiFetch<{ warrantyStory: string }>(`/api/repair-orders/${roId}/lines/${lineId}/generate-story`, {
      method: 'POST',
    }),

  decodeVin: (vin: string) =>
    apiFetch<{
      vin: string;
      year: string;
      make: string;
      model: string;
      engine: string;
      trim: string;
      valid: boolean;
    }>('/api/vin/decode', {
      method: 'POST',
      body: JSON.stringify({ vin }),
    }),

  listUsers: () => apiFetch<{ users: TechnicianUser[] }>('/api/users'),

  createUser: (data: { email: string; name: string; password: string; role: 'technician' | 'manager' }) =>
    apiFetch<{ user: TechnicianUser }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: string, data: { isActive: boolean }) =>
    apiFetch<{ user: TechnicianUser }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};