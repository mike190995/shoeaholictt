export interface DashboardMetrics {
  productCount: number;
  pendingTasks: number;
  errorLogs: number;
  systemHealth: {
    lightspeed: 'connected' | 'error' | 'disconnected';
    wooCommerce: 'connected' | 'error' | 'disconnected';
    redis: 'active' | 'inactive';
    cloudTasks: 'healthy' | 'degraded';
  };
}

export interface SyncLog {
  id: string;
  status: string;
  message: string;
  direction: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  recentActivity: SyncLog[];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch('/admin/api/dashboard');
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard data');
  }
  return response.json();
}
