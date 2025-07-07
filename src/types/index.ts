// NANDA Service Types
export interface NANDAService {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  category: string;
  endpoint_url: string;
  transport_type: 'sse' | 'websocket' | 'http' | 'streamable-http';
  capabilities: {
    tools: string[];
    resources: string[];
    prompts: string[];
  };
  metadata?: {
    homepage_url?: string;
    documentation_url?: string;
    repository_url?: string;
    license?: string;
  };
  status: 'active' | 'inactive' | 'maintenance';
  created_at: string;
  updated_at: string;
  popularity_score?: number;
  usage_count?: number;
}

// EVMAuth Types
export interface EVMAuthRequest {
  walletAddress: string;
  contractAddress?: string;
  tokenId?: string;
  signature?: string;
  message?: string;
}

export interface EVMAuthSession {
  walletAddress: string;
  contractAddress: string;
  tokenId: string;
  verified: boolean;
  verifiedAt: Date;
  expiresAt: Date;
}

// Connection Types
export interface ServiceConnection {
  id: string;
  userId?: string;
  serviceId: string;
  serviceName: string;
  state: 'initializing' | 'authenticating' | 'connected' | 'disconnected' | 'failed';
  transport: string;
  endpoint: string;
  evmAuth?: EVMAuthSession;
  metadata: {
    tools: ToolDefinition[];
    capabilities: string[];
  };
  createdAt: Date;
  lastUsed: Date;
}

// Tool Types
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface ToolExecutionRequest {
  connectionId: string;
  toolName: string;
  parameters: Record<string, any>;
}

export interface ToolExecutionResponse {
  success: boolean;
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}