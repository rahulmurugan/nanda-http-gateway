# NANDA Discovery HTTP Service - Public Mode Specification

## Overview

A lightweight HTTP-based service that provides discovery and proxy capabilities for MCP servers registered in the NANDA registry. This service operates in **public mode**, requiring no NANDA authentication tokens, making it simple to deploy and use.

## Architecture

```
┌─────────────┐     HTTP/REST      ┌──────────────────┐     Public API    ┌──────────────┐
│   Clients   │ ◄─────────────────► │ NANDA Discovery  │ ◄───────────────► │ NANDA Registry│
│ (Web/CLI)   │                     │   HTTP Service   │                    │ (Public Mode) │
└─────────────┘                     └──────────────────┘                    └──────────────┘
                                             │
                                             │ Dynamic Proxy
                                             ▼
                                    ┌──────────────────┐
                                    │  Remote MCP      │
                                    │  Servers         │
                                    └──────────────────┘
```

## Core Features

### 1. Discovery Operations (Using NANDA Public API)
- **Search servers** by query, tags, or type
- **List all servers** with pagination
- **Get server details** by ID
- **Browse popular servers** by time period

### 2. Dynamic Proxy
- **Connect to discovered servers** via HTTP/WebSocket/SSE
- **Forward tool calls** to remote MCP servers
- **Handle authentication** per-server (EVMAuth, API keys, etc.)
- **Connection pooling** for performance

### 3. Session Management
- **Stateful connections** without requiring user authentication
- **Connection persistence** across multiple tool calls
- **Automatic cleanup** of idle connections

## API Endpoints

### Discovery Endpoints

#### `GET /api/discover/search`
Search for MCP servers in the NANDA registry.

**Query Parameters:**
- `q` (required): Search query
- `tags`: Comma-separated tags
- `type`: Server type filter
- `limit`: Results per page (default: 20)
- `page`: Page number (default: 1)

**Response:**
```json
{
  "servers": [
    {
      "id": "uuid",
      "name": "Server Name",
      "description": "Description",
      "endpoint": "https://...",
      "transport": "http",
      "capabilities": ["tools"],
      "tags": ["tag1", "tag2"]
    }
  ],
  "total": 100,
  "page": 1,
  "pages": 5
}
```

#### `GET /api/discover/servers`
List all registered MCP servers.

**Query Parameters:**
- `limit`: Results per page (default: 20)
- `page`: Page number (default: 1)
- `ordering`: Sort field

**Response:** Same as search endpoint

#### `GET /api/discover/servers/:id`
Get detailed information about a specific server.

**Response:**
```json
{
  "id": "uuid",
  "name": "Server Name",
  "description": "Detailed description",
  "endpoint": "https://...",
  "transport": "http",
  "capabilities": {
    "tools": ["tool1", "tool2"],
    "resources": [],
    "prompts": []
  },
  "metadata": {
    "author": "Author Name",
    "version": "1.0.0",
    "homepage": "https://..."
  },
  "ratings": {
    "average": 4.5,
    "count": 123
  }
}
```

#### `GET /api/discover/popular`
Get popular MCP servers.

**Query Parameters:**
- `period`: `day`, `week`, `month`, `all_time` (default: `week`)
- `type`: Server type filter
- `limit`: Results to return (default: 10)

**Response:** Array of servers with popularity metrics

### Connection Management Endpoints

#### `POST /api/connections/create`
Establish a connection to a discovered MCP server.

**Request Body:**
```json
{
  "server_id": "uuid",
  "auth": {
    "type": "evmauth",
    "wallet_address": "0x...",
    "contract_address": "0x...",
    "token_id": "0"
  }
}
```

**Response:**
```json
{
  "connection_id": "conn_uuid",
  "server_name": "Server Name",
  "status": "connected",
  "available_tools": ["tool1", "tool2"]
}
```

#### `GET /api/connections`
List active connections.

**Response:**
```json
{
  "connections": [
    {
      "id": "conn_uuid",
      "server_id": "server_uuid",
      "server_name": "Server Name",
      "status": "connected",
      "created_at": "2024-01-01T00:00:00Z",
      "last_activity": "2024-01-01T00:01:00Z"
    }
  ]
}
```

#### `DELETE /api/connections/:id`
Close a connection.

### Tool Execution Endpoints

#### `POST /api/tools/call`
Execute a tool on a connected server.

**Request Body:**
```json
{
  "connection_id": "conn_uuid",
  "tool_name": "requestinfo",
  "arguments": {
    "category": "investment"
  }
}
```

**Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool execution result..."
      }
    ]
  },
  "error": null
}
```

#### `GET /api/tools/list/:connection_id`
List available tools for a connection.

**Response:**
```json
{
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "input_schema": {}
    }
  ]
}
```

### Health & Status Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "connections": {
    "active": 5,
    "max": 10
  }
}
```

## Authentication Strategy

### Service Level
- **NANDA Registry**: NO AUTHENTICATION (public endpoints only)
- **Discovery Service**: NO AUTHENTICATION (open access)

### Per-Server Authentication
Each MCP server may require its own authentication:

1. **EVMAuth** (e.g., Starbucks)
   ```json
   {
     "type": "evmauth",
     "wallet_address": "0x...",
     "contract_address": "0x...",
     "token_id": "0"
   }
   ```

2. **API Key**
   ```json
   {
     "type": "api_key",
     "key": "sk_..."
   }
   ```

3. **No Auth**
   ```json
   {
     "type": "none"
   }
   ```

## Implementation Details

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **HTTP Client**: Axios
- **WebSocket**: ws library
- **Session Storage**: In-memory (upgradeable to Redis)

### Project Structure
```
nanda-discovery-http/
├── src/
│   ├── server.ts           # Express server setup
│   ├── routes/
│   │   ├── discovery.ts    # Discovery endpoints
│   │   ├── connections.ts  # Connection management
│   │   └── tools.ts        # Tool execution
│   ├── services/
│   │   ├── nanda.ts        # NANDA API client
│   │   ├── proxy.ts        # MCP proxy logic
│   │   └── pool.ts         # Connection pooling
│   ├── middleware/
│   │   ├── cors.ts         # CORS configuration
│   │   └── errors.ts       # Error handling
│   └── types/
│       └── index.ts        # TypeScript definitions
├── package.json
├── tsconfig.json
└── README.md
```

### Environment Variables
```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# NANDA Registry
NANDA_API_URL=https://nanda-registry.com/api/v1

# Connection Pool
MAX_CONNECTIONS=10
CONNECTION_TIMEOUT=30000
IDLE_TIMEOUT=300000

# Logging
LOG_LEVEL=info
```

## Client SDKs

### JavaScript/TypeScript SDK
```typescript
import { NANDADiscovery } from '@nanda/discovery-sdk';

const client = new NANDADiscovery({
  baseURL: 'http://localhost:3000'
});

// Search for servers
const servers = await client.search('coffee');

// Connect to a server
const connection = await client.connect(serverId, {
  type: 'evmauth',
  wallet_address: '0x...',
  contract_address: '0x...',
  token_id: '0'
});

// Execute a tool
const result = await client.callTool(connection.id, 'requestinfo', {
  category: 'investment'
});
```

### CLI Tool
```bash
# Search servers
nanda-discover search "coffee"

# Connect to server
nanda-discover connect <server-id> --auth-type evmauth --wallet 0x...

# Execute tool
nanda-discover call <connection-id> requestinfo --category investment

# List connections
nanda-discover connections list
```

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  nanda-discovery:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NANDA_API_URL=https://nanda-registry.com/api/v1
    restart: unless-stopped
```

## Security Considerations

1. **CORS**: Configured for web clients
2. **Rate Limiting**: Prevent abuse of proxy functionality
3. **Input Validation**: All inputs sanitized
4. **Connection Limits**: Per-IP connection limits
5. **Timeout Protection**: Automatic cleanup of idle connections

## Performance Optimization

1. **Connection Pooling**: Reuse connections to MCP servers
2. **Response Caching**: Cache NANDA registry responses (5 min TTL)
3. **Parallel Requests**: Batch discovery operations
4. **Health Checks**: Proactive connection validation

## Error Handling

Standard HTTP status codes with detailed error messages:
```json
{
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "Failed to connect to server",
    "details": {
      "server_id": "uuid",
      "reason": "timeout"
    }
  }
}
```

## Future Enhancements

1. **WebSocket Support**: Real-time updates for long-running tools
2. **Batch Operations**: Execute multiple tools in one request
3. **Webhook Support**: Notifications for async operations
4. **GraphQL API**: Alternative query interface
5. **Server-Sent Events**: Live connection status updates

## Example Use Cases

### 1. Web Application
```javascript
// React component
const [servers, setServers] = useState([]);
const [connection, setConnection] = useState(null);

// Search servers
const searchServers = async (query) => {
  const results = await fetch(`/api/discover/search?q=${query}`);
  setServers(await results.json());
};

// Connect and use
const connectAndUse = async (serverId) => {
  const conn = await createConnection(serverId, authCredentials);
  setConnection(conn);
  
  const result = await callTool(conn.id, 'getData', params);
  displayResult(result);
};
```

### 2. Automation Script
```python
import requests

# Find analytics servers
servers = requests.get(
    "http://localhost:3000/api/discover/search",
    params={"q": "analytics", "tags": "data,reporting"}
).json()

# Connect to first result
connection = requests.post(
    "http://localhost:3000/api/connections/create",
    json={
        "server_id": servers["servers"][0]["id"],
        "auth": {"type": "none"}
    }
).json()

# Generate report
report = requests.post(
    "http://localhost:3000/api/tools/call",
    json={
        "connection_id": connection["connection_id"],
        "tool_name": "generate_report",
        "arguments": {"period": "monthly"}
    }
).json()
```

### 3. CLI Workflow
```bash
# Interactive discovery
$ nanda-discover interactive

> search: weather apis
Found 3 servers:
1. WeatherMCP - Real-time weather data
2. ClimateAPI - Historical climate data
3. WeatherAlerts - Severe weather alerts

> connect: 1
Connected to WeatherMCP (conn_abc123)

> call getCurrentWeather --location "New York"
Temperature: 72°F
Conditions: Partly cloudy
Humidity: 65%

> disconnect
Connection closed
```

## Summary

This specification defines a simple, public-mode HTTP service that:
- ✅ Requires NO NANDA authentication tokens
- ✅ Uses only public NANDA registry endpoints
- ✅ Provides full discovery capabilities
- ✅ Supports dynamic proxy to any MCP server
- ✅ Handles per-server authentication elegantly
- ✅ Works with any HTTP client (web, CLI, scripts)
- ✅ Can be deployed anywhere as a standalone service