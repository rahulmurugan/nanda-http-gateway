# NANDA HTTP Gateway

> **Enterprise-Grade HTTP Gateway for Model Context Protocol (MCP) Server Discovery and Execution**

A production-ready HTTP service that transforms the NANDA ecosystem from MCP-only to multi-client HTTP architecture, enabling seamless integration with both public and **EVMAuth-protected premium services**.

## 🚀 Key Features

- **Multi-Transport Architecture**: HTTP, WebSocket, SSE, and **Streamable HTTP** (recommended)
- **EVMAuth Integration**: Connect to blockchain-protected premium services
- **Smart Fallback System**: Automatic transport detection and fallback mechanisms
- **Service Discovery**: Real-time search across 50+ services in the NANDA registry
- **Tool Execution**: Dynamic tool discovery and execution across all transport types
- **Production Ready**: Express.js server with comprehensive error handling and validation

## 🎯 Use Cases

### For Developers
- **API Integration**: Transform any MCP server into RESTful APIs
- **Multi-Client Support**: Build web apps, CLIs, and SDKs that connect to MCP servers
- **Premium Services**: Access EVMAuth-protected services with blockchain authentication
- **Real-time Communication**: WebSocket and SSE support for live data streams

### For Enterprises
- **Service Mesh**: Centralized gateway for distributed MCP server infrastructure
- **Authentication**: Blockchain-based authentication for premium service access
- **Monitoring**: Built-in health checks and connection lifecycle management
- **Scalability**: Connection pooling and multi-user support

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │  NANDA Gateway  │    │  MCP Servers    │
│                 │    │                 │    │                 │
│ • Web Apps      │◄──►│ • HTTP API      │◄──►│ • Public        │
│ • CLI Tools     │    │ • WebSocket     │    │ • EVMAuth       │
│ • SDKs          │    │ • SSE           │    │   Protected     │
│ • Custom Apps   │    │ • Streamable    │    │ • Premium       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/rahulmurugan/nanda-http-gateway.git
cd nanda-http-gateway

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm start
```

## 🔧 Configuration

Create a `.env` file:

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
NANDA_API_BASE_URL=https://nanda-registry.com
ENABLE_CORS=true
REQUEST_TIMEOUT=30000
```

## 🚀 Quick Start

### 1. Start the Gateway

```bash
npm start
# Server running on http://localhost:3000
```

### 2. Discover Services

```bash
# Search for services
curl "http://localhost:3000/api/v2/services/search?q=calculator"

# Get service details
curl "http://localhost:3000/api/v2/services/{serviceId}"
```

### 3. Connect to Public Services

```bash
# Connect to a public service
curl -X POST "http://localhost:3000/api/v2/services/{serviceId}/connect" \
  -H "Content-Type: application/json"
```

### 4. Connect to EVMAuth-Protected Services

```bash
# Connect to premium services with blockchain authentication
curl -X POST "http://localhost:3000/api/v2/services/{serviceId}/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "evmAuth": {
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96",
      "tokenId": "1"
    }
  }'
```

## 🛠️ API Reference

### Service Discovery

#### `GET /api/v2/services`
List all available services in the NANDA registry.

**Response:**
```json
{
  "services": [
    {
      "id": "service-uuid",
      "name": "Calculator Service",
      "description": "Mathematical calculations",
      "transport": "sse",
      "protected": false,
      "provider": "community"
    }
  ]
}
```

#### `GET /api/v2/services/search`
Search services by name, description, or tags.

**Parameters:**
- `q` (string): Search query
- `transport` (string): Filter by transport type
- `protected` (boolean): Filter by protection status

### Service Connection

#### `POST /api/v2/services/{serviceId}/connect`
Connect to a specific service.

**Request Body:**
```json
{
  "evmAuth": {
    "walletAddress": "0x...",
    "contractAddress": "0x...",
    "tokenId": "1"
  }
}
```

**Response:**
```json
{
  "connectionId": "conn-uuid",
  "serviceId": "service-uuid",
  "transport": "streamable_http",
  "status": "connected",
  "tools": [
    {
      "name": "calculate",
      "description": "Perform mathematical calculations",
      "parameters": {...}
    }
  ]
}
```

### Tool Execution

#### `POST /api/v2/connections/{connectionId}/tools/{toolName}/execute`
Execute a tool on a connected service.

**Request Body:**
```json
{
  "parameters": {
    "operation": "add",
    "a": 10,
    "b": 5
  }
}
```

**Response:**
```json
{
  "result": {
    "answer": 15,
    "operation": "addition"
  },
  "execution_time": "45ms",
  "transport": "streamable_http"
}
```

## 🔐 EVMAuth Integration

The gateway supports **EVMAuth blockchain authentication** for premium services. This enables access to high-value, protected MCP servers that require token ownership verification.

### EVMAuth Process

1. **Wallet Connection**: Connect your Ethereum wallet
2. **Token Verification**: Verify ownership of required NFT/token
3. **Service Access**: Gain access to premium tools and data
4. **Blockchain Verification**: All transactions verified on-chain

### Example: Starbucks Premium Service

```bash
# Connect to Starbucks service with EVMAuth authentication
curl -X POST "http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "evmAuth": {
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96",
      "tokenId": "1"
    }
  }'

# Execute premium tools
curl -X POST "http://localhost:3000/api/v2/connections/{connectionId}/tools/requestinfo/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "category": "all"
    }
  }'
```

## 🌐 Transport Layer

The gateway supports multiple transport protocols with intelligent fallback:

### Streamable HTTP (Recommended)
- **Best Performance**: Modern HTTP streaming for real-time data
- **Bi-directional**: Full request/response and streaming support
- **Anthropic Standard**: Follows Claude's MCP specification
- **Tool Execution**: Full support for all tool operations

### WebSocket
- **Real-time**: Bi-directional communication
- **JSON-RPC**: Standard protocol support
- **Tool Execution**: Full support

### Server-Sent Events (SSE)
- **Unidirectional**: Server-to-client streaming
- **Tool Discovery**: Full support
- **Tool Execution**: Limited (fallback to HTTP)

### HTTP
- **Standard REST**: Traditional HTTP API calls
- **Tool Execution**: Full support
- **Fallback**: Universal compatibility

## 📊 Expected Results

### Service Discovery
- **Response Time**: < 200ms for registry queries
- **Coverage**: 50+ services across categories
- **Filtering**: Real-time search and category filtering

### Connection Management
- **High Success Rate**: For public services
- **EVMAuth Support**: With valid tokens
- **Fallback**: Automatic transport downgrade on failure

### Tool Execution
- **Streamable HTTP**: Optimal performance
- **WebSocket**: Real-time bi-directional communication
- **SSE**: Unidirectional streaming with HTTP fallback
- **HTTP**: Universal compatibility

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## 📈 Monitoring

### Health Checks
```bash
curl "http://localhost:3000/health"
```

### Metrics
```bash
curl "http://localhost:3000/metrics"
```

### Connection Status
```bash
curl "http://localhost:3000/api/v2/connections"
```

## 🔄 Development Workflow

### 1. Service Development
1. Register your MCP server in NANDA registry
2. Test connection through the gateway
3. Implement tool discovery and execution
4. Add EVMAuth protection if needed

### 2. Client Development
1. Use the HTTP API for standard integrations
2. Implement WebSocket for real-time features
3. Add EVMAuth for premium service access
4. Handle transport fallbacks gracefully

### 3. Production Deployment
1. Configure environment variables
2. Set up monitoring and logging
3. Implement rate limiting
4. Add authentication middleware

## 🛡️ Security

- **EVMAuth**: Blockchain-based authentication
- **Input Validation**: Comprehensive parameter validation
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Built-in request throttling
- **Connection Isolation**: User-specific connection pools

## 📚 Documentation

- **API Documentation**: `/docs/api.md`
- **Architecture Guide**: `/docs/architecture.md`
- **Transport Specification**: `/docs/transports.md`
- **EVMAuth Integration**: `/docs/evmauth.md`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/rahulmurugan/nanda-http-gateway/issues)
- **Documentation**: [Wiki](https://github.com/rahulmurugan/nanda-http-gateway/wiki)
- **Community**: [Discord](https://discord.gg/nanda)

---

**Built with ❤️ for the Radius and NANDA ecosystem**

*Transforming MCP servers into enterprise-ready HTTP services*