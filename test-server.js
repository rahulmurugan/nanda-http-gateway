// Simple test server to verify our API structure works
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Test endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'NANDA HTTP Gateway',
    description: 'HTTP-based API gateway for NANDA ecosystem with EVMAuth support',
    version: '1.0.0',
    status: 'testing',
    endpoints: {
      services: '/api/v2/services',
      connections: '/api/v2/connections',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'nanda-http-gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mock services endpoint
app.get('/api/v2/services/search', (req, res) => {
  const { q, category, limit = 20 } = req.query;
  
  // Mock Starbucks service
  const mockService = {
    id: 'cf921f9b-136f-4be0-802c-bb7e19855e96',
    name: 'Starbucks Premium MCP',
    description: 'EVMAuth-protected Starbucks company information service on Radius blockchain',
    version: '1.0.0',
    author: 'Radius Tech',
    tags: ['coffee', 'retail', 'evmauth', 'blockchain', 'radius'],
    category: 'business',
    endpoint_url: 'https://web-production-0d5f.up.railway.app',
    transport_type: 'http',
    capabilities: {
      tools: ['requestinfo'],
      resources: [],
      prompts: []
    },
    status: 'active',
    popularity_score: 95
  };

  let services = [mockService];
  
  // Filter by query
  if (q) {
    const query = q.toLowerCase();
    services = services.filter(s => 
      s.name.toLowerCase().includes(query) || 
      s.description.toLowerCase().includes(query) ||
      s.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }
  
  // Filter by category
  if (category) {
    services = services.filter(s => s.category === category);
  }

  res.json({
    success: true,
    data: services,
    meta: {
      total: services.length,
      limit: parseInt(limit),
      offset: 0
    }
  });
});

// Mock service details
app.get('/api/v2/services/:serviceId', (req, res) => {
  const { serviceId } = req.params;
  
  if (serviceId === 'cf921f9b-136f-4be0-802c-bb7e19855e96') {
    res.json({
      success: true,
      data: {
        id: 'cf921f9b-136f-4be0-802c-bb7e19855e96',
        name: 'Starbucks Premium MCP',
        description: 'EVMAuth-protected Starbucks company information service on Radius blockchain',
        version: '1.0.0',
        author: 'Radius Tech',
        tags: ['coffee', 'retail', 'evmauth', 'blockchain', 'radius'],
        category: 'business',
        endpoint_url: 'https://web-production-0d5f.up.railway.app',
        transport_type: 'http',
        capabilities: {
          tools: ['requestinfo'],
          resources: [],
          prompts: []
        },
        metadata: {
          homepage_url: 'https://github.com/rahulmurugan/NANDA',
          documentation_url: 'https://github.com/rahulmurugan/NANDA/blob/main/README.md',
          repository_url: 'https://github.com/rahulmurugan/NANDA',
          license: 'MIT'
        },
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        popularity_score: 95,
        usage_count: 1000
      }
    });
  } else {
    res.status(404).json({
      success: false,
      error: {
        code: 'SERVICE_NOT_FOUND',
        message: 'Service not found'
      }
    });
  }
});

// Mock connection endpoint
app.post('/api/v2/services/:serviceId/connect', (req, res) => {
  const { serviceId } = req.params;
  const { evmAuth } = req.body;
  
  if (serviceId !== 'cf921f9b-136f-4be0-802c-bb7e19855e96') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SERVICE_NOT_FOUND',
        message: 'Service not found'
      }
    });
  }
  
  // Check if EVMAuth is provided for Starbucks
  if (!evmAuth) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'EVMAUTH_REQUIRED',
        message: 'This service requires EVMAuth authentication',
        details: {
          requiredFields: ['walletAddress', 'contractAddress', 'tokenId'],
          contractAddress: '0x5448Dc20ad9e0cDb5Dd0db25e814545d1aa08D96'
        }
      }
    });
  }
  
  // Mock successful connection
  const connectionId = 'conn_' + Date.now();
  res.status(201).json({
    success: true,
    data: {
      connectionId,
      serviceId,
      serviceName: 'Starbucks Premium MCP',
      state: 'connected',
      transport: 'http',
      endpoint: 'https://web-production-0d5f.up.railway.app',
      evmAuth: {
        walletAddress: evmAuth.walletAddress,
        verified: true,
        verifiedAt: new Date()
      },
      tools: [
        {
          name: 'requestinfo',
          description: 'Get Starbucks company information with EVMAuth verification on Radius blockchain'
        }
      ],
      createdAt: new Date()
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 NANDA HTTP Gateway test server running on http://localhost:${port}`);
  console.log(`📖 API Documentation:`);
  console.log(`   GET  /                                    - API info`);
  console.log(`   GET  /health                              - Health check`);
  console.log(`   GET  /api/v2/services/search              - Search services`);
  console.log(`   GET  /api/v2/services/:id                 - Get service details`);
  console.log(`   POST /api/v2/services/:id/connect         - Connect to service`);
  console.log(``);
  console.log(`🧪 Test Commands:`);
  console.log(`   curl http://localhost:3000/health`);
  console.log(`   curl "http://localhost:3000/api/v2/services/search?q=starbucks"`);
  console.log(`   curl http://localhost:3000/api/v2/services/cf921f9b-136f-4be0-802c-bb7e19855e96`);
});