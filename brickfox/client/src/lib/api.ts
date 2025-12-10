export async function apiRequest(url: string, options: RequestInit = {}) {
  // Try both localStorage and sessionStorage for token (depends on "Remember Me" setting)
  const token = localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token');
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Set Content-Type for JSON requests (body is already stringified in apiPost/apiPut)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Send cookies for session-based auth
    headers,
  });
  
  // Auto-logout on 401
  if (response.status === 401) {
    localStorage.removeItem('supabase_token');
    sessionStorage.removeItem('supabase_token');
    window.location.href = '/login';
  }
  
  return response;
}

export async function apiGet<T>(url: string): Promise<T> {
  const response = await apiRequest(url);
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

export async function apiPost<T>(url: string, data?: any): Promise<T> {
  const response = await apiRequest(url, {
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

export async function apiPut<T>(url: string, data: any): Promise<T> {
  const response = await apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

export async function apiDelete<T>(url: string): Promise<T> {
  const response = await apiRequest(url, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

export async function apiDownload(url: string, data: any, filename: string): Promise<void> {
  const response = await apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) throw new Error('Download failed');
  
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}
