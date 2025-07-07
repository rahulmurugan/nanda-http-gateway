# NANDA HTTP Gateway - API Testing Guide

## 🚀 Quick Start

### Installation
```bash
# Fix npm cache (if needed)
sudo chown -R $(whoami) ~/.npm

# Install dependencies
npm install

# Start development server
npm run dev
```

### Alternative (using yarn)
```bash
# Install yarn if not available
npm install -g yarn

# Install dependencies
yarn install

# Start server
yarn dev
```

## 📖 API Endpoints

### Base URL
```
http://localhost:3000
```

### 1. Health Check
```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "nanda-http-gateway",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. API Info
```bash
curl http://localhost:3000/
```

**Expected Response:**
```json
{
  "name": "NANDA HTTP Gateway",
  "description": "HTTP-based API gateway for NANDA ecosystem with EVMAuth support",
  "version": "1.0.0",
  "endpoints": {
    "services": "/api/v2/services",
    "connections": "/api/v2/connections",
    "health": "/health"
  }
}
```

## 🔍 Service Discovery API

### 3. Search Services (Public)
```bash
# Search all services
curl "http://localhost:3000/api/v2/services/search"

# Search for Starbucks
curl "http://localhost:3000/api/v2/services/search?q=starbucks"

# Search by category
curl "http://localhost:3000/api/v2/services/search?category=business"

# Search with pagination
curl "http://localhost:3000/api/v2/services/search?limit=10&offset=0"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cf921f9b-136f-4be0-802c-bb7e19855e96",
      "name": "Starbucks Premium MCP",
      "description": "EVMAuth-protected Starbucks company information service on Radius blockchain",
      "tags": ["coffee", "retail", "evmauth", "blockchain", "radius"],
      "category": "business",
      "endpoint_url": "https://web-production-0d5f.up.railway.app",
      "transport_type": "http",
      "capabilities": {
        "tools": ["requestinfo"]
      },
      "status": "active"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

### 4. Get Popular Services (Public)
```bash
curl "http://localhost:3000/api/v2/services/popular"
curl "http://localhost:3000/api/v2/services/popular?timeframe=week"
```

### 5. Get Service Details (Public)
```bash
curl http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "cf921f9b-136f-4be0-802c-bb7e19855e96",
    "name": "Starbucks Premium MCP",
    "description": "EVMAuth-protected Starbucks company information service on Radius blockchain",
    "version": "1.0.0",
    "author": "Radius Tech",
    "tags": ["coffee", "retail", "evmauth", "blockchain", "radius"],
    "category": "business",
    "endpoint_url": "https://web-production-0d5f.up.railway.app",
    "transport_type": "http",
    "capabilities": {
      "tools": ["requestinfo"],
      "resources": [],
      "prompts": []
    },
    "metadata": {
      "homepage_url": "https://github.com/rahulmurugan/NANDA",
      "repository_url": "https://github.com/rahulmurugan/NANDA"
    },
    "status": "active",
    "popularity_score": 95
  }
}
```

### 6. Get Service Tools (Public)
```bash
curl http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/tools
```

## 🔐 EVMAuth Connection API

### 7. Connect to EVMAuth Service
```bash
# This will fail without EVMAuth
curl -X POST http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/connect \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Error:**
```json
{
  "success": false,
  "error": {
    "code": "EVMAUTH_REQUIRED",
    "message": "This service requires EVMAuth authentication",
    "details": {
      "requiredFields": ["walletAddress", "contractAddress", "tokenId"],
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96"
    }
  }
}
```

### 8. Connect with EVMAuth
```bash
curl -X POST http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/connect \
  -H "Content-Type: application/json" \
  -d '{
    "evmAuth": {
      "walletAddress": "0x742d35Cc6634C0532925a3b8D76C9CBCC1b346a7",
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96",
      "tokenId": "1"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "connectionId": "conn_12345",
    "serviceId": "cf921f9b-136f-4be0-802c-bb7e19855e96",
    "serviceName": "Starbucks Premium MCP",
    "state": "connected",
    "transport": "http",
    "endpoint": "https://web-production-0d5f.up.railway.app",
    "evmAuth": {
      "walletAddress": "0x742d35Cc6634C0532925a3b8D76C9CBCC1b346a7",
      "verified": true,
      "verifiedAt": "2024-01-01T00:00:00.000Z"
    },
    "tools": [
      {
        "name": "requestinfo",
        "description": "Get Starbucks company information with EVMAuth verification on Radius blockchain",
        "inputSchema": {
          "type": "object",
          "properties": {
            "walletAddress": { "type": "string" },
            "contractAddress": { "type": "string" },
            "tokenId": { "type": "string" },
            "category": { "type": "string", "enum": ["overview", "focus", "investment", "contact", "all"] }
          },
          "required": ["walletAddress"]
        }
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## 🔗 Connection Management API

### 9. List Connections
```bash
curl http://localhost:3000/api/v2/connections
```

### 10. Get Connection Details
```bash
curl http://localhost:3000/api/v2/connections/conn_12345
```

### 11. Execute Tool on Connection
```bash
curl -X POST http://localhost:3000/api/v2/connections/conn_12345/tools/requestinfo/execute \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "walletAddress": "0x742d35Cc6634C0532925a3b8D76C9CBCC1b346a7",
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96",
      "tokenId": "1",
      "category": "overview"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "connectionId": "conn_12345",
    "toolName": "requestinfo",
    "result": {
      "company": "Starbucks Corporation",
      "overview": "Global coffeehouse chain...",
      "category": "overview"
    },
    "metadata": {
      "executionTime": 1250,
      "executedAt": "2024-01-01T00:00:00.000Z",
      "serviceId": "cf921f9b-136f-4be0-802c-bb7e19855e96",
      "serviceName": "Starbucks Premium MCP"
    }
  }
}
```

### 12. Close Connection
```bash
curl -X DELETE http://localhost:3000/api/v2/connections/conn_12345
```

## 🧪 Test Scenarios

### Complete EVMAuth Flow Test
```bash
# 1. Search for EVMAuth services
curl "http://localhost:3000/api/v2/services/search?q=evmauth"

# 2. Get Starbucks service details
curl http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96

# 3. Try connecting without auth (should fail)
curl -X POST http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/connect \
  -H "Content-Type: application/json" -d '{}'

# 4. Connect with EVMAuth
curl -X POST http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96/connect \
  -H "Content-Type: application/json" \
  -d '{
    "evmAuth": {
      "walletAddress": "0x742d35Cc6634C0532925a3b8D76C9CBCC1b346a7",
      "contractAddress": "0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96",
      "tokenId": "1"
    }
  }'

# 5. List connections
curl http://localhost:3000/api/v2/connections

# 6. Execute requestinfo tool
curl -X POST http://localhost:3000/api/v2/connections/{connectionId}/tools/requestinfo/execute \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "walletAddress": "0x742d35Cc6634C0532925a3b8D76C9CBCC1b346a7",
      "category": "all"
    }
  }'
```

## 🐛 Troubleshooting

### Common Issues

1. **Server won't start**
   ```bash
   # Check if port 3000 is in use
   lsof -i :3000
   
   # Use different port
   PORT=3001 npm run dev
   ```

2. **Module not found errors**
   ```bash
   # Clean install
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **EVMAuth verification fails**
   - Check wallet address format (0x + 40 hex chars)
   - Ensure contract address is correct
   - Verify token ownership on Radius blockchain

### Expected File Structure
```
src/
├── api/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   └── validators/
├── services/
│   ├── nanda-api.client.ts
│   ├── evmauth.service.ts
│   ├── connection.manager.ts
│   └── transport.manager.ts
├── types/
└── utils/
```

## 🎯 Next Steps

1. **Install dependencies** and start server
2. **Test basic endpoints** (health, search)
3. **Test EVMAuth flow** with valid Radius wallet
4. **Verify tool execution** works correctly
5. **Add database persistence** (optional)
6. **Implement WebSocket** for real-time features