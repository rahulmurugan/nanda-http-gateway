# NANDA HTTP-Based Architecture Specification

## Executive Summary

This specification outlines the transformation of NANDA Discovery from an MCP (Model Context Protocol) based system to a production-ready HTTP-based architecture. The new design prioritizes scalability, multi-client support, elegant authentication handling, and real-time capabilities while maintaining backward compatibility where feasible.

## Current Architecture Analysis

### MCP-Based System Components

1. **NANDA Discovery MCP Server**
   - Uses StdioServerTransport for Claude Desktop communication
   - Acts as both discovery tool and proxy to remote MCP servers
   - Manages tool registry and connection pooling
   - Optionally handles JWT authentication for NANDA API access

2. **Authentication Flow**
   - NANDA Registry offers both public and authenticated endpoints
   - Basic discovery operations (search, list, popular) require NO authentication
   - JWT token only needed for user-specific features (recommendations, server registration)
   - No authentication forwarding to remote MCP servers
   - Token expiry handled with 5-minute buffer when used

3. **Remote Server Connection**
   - Supports SSE, WebSocket, HTTP, and streamable-http transports
   - Dynamic tool discovery upon connection
   - Tool name prefixing to avoid conflicts (e.g., `starbucks_requestinfo`)
   - Connection pooling with health checks

4. **Current Pain Points**
   - Limited to Claude Desktop as client
   - Complex MCP protocol overhead
   - Difficult to debug and monitor
   - Single user/session limitation
   - Not leveraging NANDA's public API capabilities

## Proposed HTTP-Based Architecture

### Core Design Principles

1. **RESTful API First**: All operations exposed via REST endpoints
2. **Stateless Design**: Session management via JWT tokens
3. **WebSocket Support**: For real-time features and persistent connections
4. **Multi-Transport**: Support REST, WebSocket, SSE, and GraphQL
5. **Client Agnostic**: Support web, mobile, CLI, and SDK clients
6. **Microservices Ready**: Modular design for horizontal scaling

### System Components

#### 1. NANDA Discovery API Service

```yaml
Base URL: https://api.nanda.ai/v2
Protocols: HTTPS, WSS
Authentication: Optional (JWT Bearer tokens for advanced features)
Rate Limiting: Per-user (authenticated) and per-IP (public)
```

**Core Endpoints:**

```http
# Discovery Operations (PUBLIC - No Auth Required)
GET  /services/search?q={query}&category={category}&tags={tags}
GET  /services/popular?timeframe={day|week|month}
GET  /services/{serviceId}

# Discovery Operations (AUTHENTICATED - JWT Required)
GET  /services/recommendations
POST /services/register

# Connection Management (PUBLIC)
POST /services/{serviceId}/connect
GET  /services/{serviceId}/tools
GET  /connections
GET  /connections/{connectionId}
DELETE /connections/{connectionId}
POST /connections/{connectionId}/tools/{toolName}/execute

# Authentication (Optional for basic features)
POST /auth/login
POST /auth/register
POST /auth/refresh
POST /auth/logout
GET  /auth/session

# Real-time (PUBLIC)
WS   /ws/connections
SSE  /events/connections
```

#### 2. Authentication & Authorization

**Multi-Level Authentication Strategy:**

```typescript
interface AuthenticationLevels {
  // Level 1: NANDA Platform Access (OPTIONAL)
  platform?: {
    type: 'jwt' | 'oauth2' | 'api_key';
    token: string;
    permissions: string[];
    expiresAt: Date;
    required: boolean; // false for basic discovery
  };
  
  // Level 2: Service-Specific Auth (required per service)
  service?: {
    type: 'evmauth' | 'oauth2' | 'custom';
    credentials: Record<string, any>;
    serviceId: string;
  };
  
  // Level 3: Tool-Level Auth (optional)
  tool?: {
    type: 'signature' | 'token';
    credentials: Record<string, any>;
    toolName: string;
  };
}
```

**Token Management:**

```typescript
// Platform JWT Token Payload
interface NANDATokenPayload {
  sub: string;           // User ID
  iat: number;           // Issued at
  exp: number;           // Expires at
  aud: string[];         // Allowed services
  scope: string[];       // Permissions
  plan: 'free' | 'pro' | 'enterprise';
  rateLimit: {
    requests: number;
    window: number;
  };
}

// Service Connection Token
interface ServiceConnectionToken {
  connectionId: string;
  serviceId: string;
  userId: string;
  established: Date;
  lastActivity: Date;
  authContext?: any;     // Service-specific auth data
}
```

#### 3. Service Connection Manager

**Connection Lifecycle:**

```typescript
enum ConnectionState {
  INITIALIZING = 'initializing',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed'
}

interface ServiceConnection {
  id: string;
  userId: string;
  serviceId: string;
  state: ConnectionState;
  transport: 'http' | 'websocket' | 'sse';
  endpoint: string;
  metadata: {
    serviceName: string;
    serviceVersion: string;
    capabilities: string[];
    tools: ToolDefinition[];
  };
  auth?: {
    type: string;
    expiresAt?: Date;
  };
  health: {
    lastPing: Date;
    latency: number;
    errorRate: number;
  };
  created: Date;
  lastUsed: Date;
}
```

**Connection Pool Management:**

```typescript
class ConnectionPoolManager {
  // Per-user connection limits
  private limits = {
    free: 3,
    pro: 10,
    enterprise: 100
  };
  
  // Connection lifecycle
  async createConnection(userId: string, serviceId: string, auth?: any): Promise<ServiceConnection>;
  async validateConnection(connectionId: string): Promise<boolean>;
  async refreshConnection(connectionId: string): Promise<void>;
  async terminateConnection(connectionId: string): Promise<void>;
  
  // Health monitoring
  async healthCheck(connectionId: string): Promise<HealthStatus>;
  async getConnectionMetrics(connectionId: string): Promise<ConnectionMetrics>;
}
```

#### 4. Tool Execution Engine

**Tool Request Format:**

```typescript
interface ToolExecutionRequest {
  connectionId: string;
  toolName: string;
  parameters: Record<string, any>;
  auth?: {
    type: 'signature' | 'token';
    credentials: any;
  };
  options?: {
    timeout?: number;
    retries?: number;
    streaming?: boolean;
  };
}

interface ToolExecutionResponse {
  requestId: string;
  connectionId: string;
  toolName: string;
  status: 'success' | 'error' | 'timeout';
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    executionTime: number;
    retryCount: number;
  };
}
```

**Tool Registry:**

```typescript
interface ToolRegistry {
  // Tool discovery
  async discoverTools(serviceId: string): Promise<ToolDefinition[]>;
  async getToolSchema(serviceId: string, toolName: string): Promise<ToolSchema>;
  
  // Tool validation
  async validateToolCall(request: ToolExecutionRequest): Promise<ValidationResult>;
  async checkToolPermissions(userId: string, toolName: string): Promise<boolean>;
  
  // Tool execution
  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse>;
  async executeToolStream(request: ToolExecutionRequest): AsyncGenerator<ToolExecutionEvent>;
}
```

#### 5. Real-Time Communication

**WebSocket Protocol:**

```typescript
// Client -> Server Messages
interface WSClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'execute' | 'ping';
  id: string;
  payload: any;
}

// Server -> Client Messages
interface WSServerMessage {
  type: 'connection_update' | 'tool_result' | 'error' | 'pong';
  id: string;
  timestamp: Date;
  payload: any;
}

// WebSocket Connection Manager
class WebSocketManager {
  // Connection handling
  async handleConnection(ws: WebSocket, userId: string): Promise<void>;
  async broadcastToUser(userId: string, message: WSServerMessage): Promise<void>;
  
  // Subscription management
  async subscribe(userId: string, events: string[]): Promise<void>;
  async unsubscribe(userId: string, events: string[]): Promise<void>;
  
  // Real-time tool execution
  async streamToolExecution(
    ws: WebSocket, 
    request: ToolExecutionRequest
  ): Promise<void>;
}
```

**Server-Sent Events (SSE):**

```typescript
// SSE Event Types
interface SSEEvent {
  event: 'connection' | 'tool' | 'health' | 'notification';
  data: any;
  id?: string;
  retry?: number;
}

// SSE Manager
class SSEManager {
  async createEventStream(userId: string, filters?: EventFilters): Response;
  async sendEvent(userId: string, event: SSEEvent): Promise<void>;
  async closeStream(userId: string): Promise<void>;
}
```

### Deployment Architecture

#### 1. Microservices Decomposition

```yaml
services:
  # API Gateway
  gateway:
    image: nanda/gateway:latest
    features:
      - Rate limiting
      - Request routing
      - SSL termination
      - CORS handling
    
  # Discovery Service
  discovery:
    image: nanda/discovery:latest
    responsibilities:
      - Service search
      - Recommendations
      - Popularity tracking
    
  # Connection Manager
  connections:
    image: nanda/connections:latest
    responsibilities:
      - Connection lifecycle
      - Health monitoring
      - Connection pooling
    
  # Tool Executor
  executor:
    image: nanda/executor:latest
    responsibilities:
      - Tool validation
      - Tool execution
      - Result caching
    
  # Auth Service
  auth:
    image: nanda/auth:latest
    responsibilities:
      - Token generation
      - Token validation
      - Permission management
    
  # WebSocket Service
  websocket:
    image: nanda/websocket:latest
    responsibilities:
      - Real-time connections
      - Event broadcasting
      - Connection state sync
```

#### 2. Database Architecture

```sql
-- Core Tables
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  plan VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE services (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  endpoint VARCHAR(1000),
  transport VARCHAR(50),
  capabilities JSONB,
  metadata JSONB,
  status VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  state VARCHAR(50),
  auth_context JSONB,
  health_metrics JSONB,
  created_at TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE TABLE tool_executions (
  id UUID PRIMARY KEY,
  connection_id UUID REFERENCES connections(id),
  tool_name VARCHAR(255),
  parameters JSONB,
  result JSONB,
  status VARCHAR(50),
  execution_time_ms INTEGER,
  created_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_connections_user_id ON connections(user_id);
CREATE INDEX idx_connections_service_id ON connections(service_id);
CREATE INDEX idx_tool_executions_connection_id ON tool_executions(connection_id);
CREATE INDEX idx_tool_executions_created_at ON tool_executions(created_at);
```

#### 3. Caching Strategy

```yaml
caching:
  # Service discovery cache
  discovery:
    store: Redis
    ttl: 300  # 5 minutes
    invalidation:
      - On service update
      - On popularity change
  
  # Tool schemas cache
  schemas:
    store: Redis
    ttl: 3600  # 1 hour
    invalidation:
      - On service version change
  
  # Connection state cache
  connections:
    store: Redis
    ttl: 60  # 1 minute
    invalidation:
      - On connection update
      - On health check
  
  # Tool execution results
  executions:
    store: Redis
    ttl: Variable  # Based on tool type
    key: "exec:{userId}:{toolName}:{paramHash}"
```

### Client SDKs

#### 1. JavaScript/TypeScript SDK

```typescript
import { NANDAClient } from '@nanda/sdk';

// Initialize client
const nanda = new NANDAClient({
  apiKey: 'your-api-key',
  environment: 'production'
});

// Search for services
const services = await nanda.services.search({
  query: 'coffee',
  category: 'business'
});

// Connect to a service
const connection = await nanda.connect(serviceId, {
  auth: {
    type: 'evmauth',
    walletAddress: '0x...'
  }
});

// Execute a tool
const result = await connection.execute('requestinfo', {
  walletAddress: '0x...',
  contractAddress: '0x...',
  tokenId: '1',
  category: 'premium'
});

// Real-time subscriptions
connection.on('update', (event) => {
  console.log('Connection updated:', event);
});

// Stream tool execution
for await (const event of connection.stream('analyze', params)) {
  console.log('Progress:', event);
}
```

#### 2. Python SDK

```python
from nanda import NANDAClient

# Initialize client
client = NANDAClient(api_key="your-api-key")

# Search services
services = client.services.search(
    query="coffee",
    category="business"
)

# Connect and execute
async with client.connect(service_id) as connection:
    result = await connection.execute(
        "requestinfo",
        wallet_address="0x...",
        contract_address="0x...",
        token_id="1",
        category="premium"
    )
    
    # Stream execution
    async for event in connection.stream("analyze", params):
        print(f"Progress: {event}")
```

#### 3. CLI Tool

```bash
# Install CLI
npm install -g @nanda/cli

# Configure authentication
nanda auth login

# Search services
nanda search "coffee" --category business

# Connect to service
nanda connect cf921f9b-136f-4be0-802c-bb7e19855e96

# Execute tool
nanda exec requestinfo \
  --wallet-address "0x..." \
  --contract-address "0x..." \
  --token-id "1" \
  --category "premium"

# Stream tool execution
nanda stream analyze --param1 value1 --param2 value2
```

### Migration Strategy

#### Phase 1: Dual Protocol Support 
- Deploy HTTP API alongside existing MCP server
- Implement REST endpoints for all MCP operations
- Add WebSocket support for real-time features
- Maintain backward compatibility

#### Phase 2: Client Migration 
- Release SDK libraries
- Update documentation
- Provide migration guides
- Support both protocols simultaneously

#### Phase 3: Feature Enhancement 
- Add advanced caching
- Implement GraphQL endpoint
- Add batch operations
- Enhance monitoring and analytics

#### Phase 4: MCP Deprecation 
- Gradually phase out MCP support
- Convert remaining MCP clients
- Full transition to HTTP-based architecture

### Security Considerations

1. **API Security**
   - Rate limiting per user and IP
   - Request signing for sensitive operations
   - Input validation and sanitization
   - SQL injection prevention
   - XSS protection

2. **Authentication Security**
   - JWT token rotation
   - Refresh token management
   - Multi-factor authentication support
   - OAuth2 integration

3. **Connection Security**
   - TLS 1.3 for all connections
   - Certificate pinning for mobile clients
   - WebSocket origin validation
   - Connection timeout management

4. **Data Security**
   - Encryption at rest
   - Encryption in transit
   - PII data handling
   - GDPR compliance
   - Audit logging

### Performance Optimization

1. **API Performance**
   - Response compression
   - HTTP/2 support
   - Connection pooling
   - Database query optimization
   - CDN integration

2. **Real-time Performance**
   - WebSocket connection pooling
   - Message batching
   - Binary protocol support
   - Compression algorithms

3. **Scaling Strategy**
   - Horizontal scaling for all services
   - Auto-scaling based on metrics
   - Global load balancing
   - Multi-region deployment

### Monitoring & Observability

```yaml
monitoring:
  metrics:
    - API response times
    - Connection success rates
    - Tool execution times
    - Error rates by service
    - Active connections
    - Cache hit rates
    
  logging:
    - Structured JSON logs
    - Correlation IDs
    - User activity tracking
    - Error stack traces
    
  tracing:
    - Distributed tracing
    - Request flow visualization
    - Performance bottleneck identification
    
  alerting:
    - Service health alerts
    - Performance degradation
    - Security incidents
    - Rate limit violations
```

## Conclusion

This HTTP-based architecture provides a robust, scalable foundation for the NANDA ecosystem. It addresses current limitations while enabling future growth through:

- Multi-client support beyond Claude Desktop
- Elegant authentication handling without environment variables
- Real-time capabilities via WebSocket and SSE
- Horizontal scaling for enterprise deployments
- Comprehensive monitoring and security

The phased migration approach ensures smooth transition with minimal disruption to existing users while unlocking new possibilities for the NANDA platform.