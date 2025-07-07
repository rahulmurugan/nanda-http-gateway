# NANDA HTTP Implementation Plan

## Overview

This document provides a concrete implementation plan for transforming NANDA from MCP to HTTP-based architecture, with production-ready code examples and detailed technical specifications.

## Implementation Phases

### Phase 1: Core HTTP API Service (Week 1-2)

#### 1.1 Project Structure

```
nanda-http-api/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.routes.ts         # Optional auth endpoints
│   │   │   ├── services.routes.ts     # Public + authenticated endpoints
│   │   │   ├── connections.routes.ts  # Public endpoints
│   │   │   └── tools.routes.ts        # Public endpoints
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts     # Optional auth checking
│   │   │   ├── rateLimit.middleware.ts
│   │   │   ├── validation.middleware.ts
│   │   │   └── errorHandler.middleware.ts
│   │   └── controllers/
│   │       ├── auth.controller.ts
│   │       ├── services.controller.ts
│   │       ├── connections.controller.ts
│   │       └── tools.controller.ts
│   ├── services/
│   │   ├── auth/
│   │   │   ├── jwt.service.ts
│   │   │   ├── oauth.service.ts
│   │   │   └── evmauth.service.ts
│   │   ├── discovery/
│   │   │   ├── search.service.ts
│   │   │   ├── recommendations.service.ts
│   │   │   └── registry.service.ts
│   │   ├── connections/
│   │   │   ├── pool.service.ts
│   │   │   ├── health.service.ts
│   │   │   └── transport.service.ts
│   │   └── tools/
│   │       ├── executor.service.ts
│   │       ├── validator.service.ts
│   │       └── registry.service.ts
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── service.model.ts
│   │   ├── connection.model.ts
│   │   └── execution.model.ts
│   ├── utils/
│   │   ├── cache.ts
│   │   ├── logger.ts
│   │   ├── metrics.ts
│   │   └── errors.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   ├── security.ts
│   │   └── app.ts
│   └── index.ts
├── tests/
├── docs/
└── package.json
```

#### 1.2 Core API Implementation

**Express Application Setup (src/index.ts):**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler } from './api/middleware/errorHandler.middleware';
import { requestLogger } from './api/middleware/logger.middleware';
import { setupRoutes } from './api/routes';
import { initializeServices } from './services';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';
import { MetricsCollector } from './utils/metrics';

export class NANDAServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private metrics: MetricsCollector;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.metrics = new MetricsCollector();
  }

  async initialize(): Promise<void> {
    // Database connection
    await connectDatabase();
    
    // Initialize services
    await initializeServices();
    
    // Middleware
    this.setupMiddleware();
    
    // Routes
    this.setupRoutes();
    
    // WebSocket
    this.setupWebSocket();
    
    // Error handling
    this.app.use(errorHandler);
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    
    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
    }));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Compression
    this.app.use(compression());
    
    // Request logging
    this.app.use(requestLogger);
    
    // Metrics
    this.app.use(this.metrics.middleware());
  }

  private setupRoutes(): void {
    setupRoutes(this.app);
  }

  private setupWebSocket(): void {
    this.wss.on('connection', async (ws, req) => {
      const userId = await this.authenticateWebSocket(req);
      if (!userId) {
        ws.close(1008, 'Unauthorized');
        return;
      }
      
      // Handle WebSocket connection
      const wsHandler = new WebSocketHandler(ws, userId);
      await wsHandler.initialize();
    });
  }

  async start(port: number = 3000): Promise<void> {
    this.server.listen(port, () => {
      logger.info(`NANDA HTTP API Server running on port ${port}`);
    });
  }
}

// Start server
const server = new NANDAServer();
server.initialize()
  .then(() => server.start(process.env.PORT || 3000))
  .catch(err => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
```

**Authentication Controller (src/api/controllers/auth.controller.ts):**

```typescript
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth/auth.service';
import { validateLoginRequest, validateRefreshRequest } from '../validators/auth.validator';

export class AuthController {
  constructor(private authService: AuthService) {}

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, walletAddress, signature } = req.body;
      
      let result;
      if (walletAddress && signature) {
        // EVM authentication
        result = await this.authService.loginWithWallet(walletAddress, signature);
      } else {
        // Traditional authentication
        result = await this.authService.login(email, password);
      }
      
      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      
      const result = await this.authService.refreshTokens(refreshToken);
      
      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const token = req.headers.authorization?.split(' ')[1];
      
      await this.authService.logout(userId, token!);
      
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const session = await this.authService.getSession(userId);
      
      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

**Service Discovery Controller (src/api/controllers/services.controller.ts):**

```typescript
import { Request, Response, NextFunction } from 'express';
import { DiscoveryService } from '../../services/discovery/discovery.service';
import { ConnectionService } from '../../services/connections/connection.service';

export class ServicesController {
  constructor(
    private discoveryService: DiscoveryService,
    private connectionService: ConnectionService
  ) {}

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, category, tags, limit = 20, offset = 0, sort = 'popularity' } = req.query;
      
      const results = await this.discoveryService.searchServices({
        query: q as string,
        category: category as string,
        tags: tags ? (tags as string).split(',') : undefined,
        limit: Number(limit),
        offset: Number(offset),
        sortBy: sort as any,
      });
      
      res.json({
        success: true,
        data: results,
        meta: {
          total: results.totalCount,
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPopular(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { timeframe = 'week' } = req.query;
      
      const popular = await this.discoveryService.getPopularServices(
        timeframe as 'day' | 'week' | 'month'
      );
      
      res.json({
        success: true,
        data: popular,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const recommendations = await this.discoveryService.getRecommendations(userId);
      
      res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      next(error);
    }
  }

  async getServiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { serviceId } = req.params;
      
      const service = await this.discoveryService.getServiceById(serviceId);
      
      res.json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }

  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { serviceId } = req.params;
      const { auth } = req.body;
      
      const connection = await this.connectionService.createConnection(
        userId,
        serviceId,
        auth
      );
      
      res.status(201).json({
        success: true,
        data: connection,
      });
    } catch (error) {
      next(error);
    }
  }

  async getServiceTools(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { serviceId } = req.params;
      
      const tools = await this.discoveryService.getServiceTools(serviceId);
      
      res.json({
        success: true,
        data: tools,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

### Phase 2: Connection Management (Week 3-4)

#### 2.1 Connection Pool Service

```typescript
// src/services/connections/pool.service.ts
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Connection, ConnectionState } from '../../models/connection.model';
import { TransportFactory } from './transport.factory';
import { HealthChecker } from './health.service';
import { logger } from '../../utils/logger';

export class ConnectionPoolService extends EventEmitter {
  private connections: Map<string, ConnectionInstance> = new Map();
  private redis: Redis;
  private healthChecker: HealthChecker;
  private transportFactory: TransportFactory;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.healthChecker = new HealthChecker();
    this.transportFactory = new TransportFactory();
  }

  async createConnection(
    userId: string,
    serviceId: string,
    serviceDetails: any,
    auth?: any
  ): Promise<Connection> {
    // Check user limits
    const userConnections = await this.getUserConnections(userId);
    const limit = await this.getUserConnectionLimit(userId);
    
    if (userConnections.length >= limit) {
      throw new Error(`Connection limit reached (${limit})`);
    }

    const connectionId = uuidv4();
    const connection: Connection = {
      id: connectionId,
      userId,
      serviceId,
      state: ConnectionState.INITIALIZING,
      transport: serviceDetails.transport_type,
      endpoint: serviceDetails.endpoint_url,
      metadata: {
        serviceName: serviceDetails.name,
        serviceVersion: serviceDetails.version,
        capabilities: serviceDetails.capabilities,
        tools: [],
      },
      auth: auth ? { type: auth.type, expiresAt: auth.expiresAt } : undefined,
      health: {
        lastPing: new Date(),
        latency: 0,
        errorRate: 0,
      },
      created: new Date(),
      lastUsed: new Date(),
    };

    // Create transport connection
    const transport = this.transportFactory.create(
      serviceDetails.transport_type,
      serviceDetails.endpoint_url
    );

    const instance: ConnectionInstance = {
      connection,
      transport,
      pendingRequests: new Map(),
    };

    try {
      // Initialize connection
      await this.initializeConnection(instance, auth);
      
      // Store in memory and Redis
      this.connections.set(connectionId, instance);
      await this.saveConnectionToRedis(connection);
      
      // Start health monitoring
      this.healthChecker.monitor(connectionId, instance);
      
      // Emit event
      this.emit('connection:created', connection);
      
      return connection;
    } catch (error) {
      logger.error('Failed to create connection:', error);
      throw new Error(`Failed to connect to service: ${error.message}`);
    }
  }

  private async initializeConnection(
    instance: ConnectionInstance,
    auth?: any
  ): Promise<void> {
    const { connection, transport } = instance;
    
    try {
      // Update state
      connection.state = ConnectionState.AUTHENTICATING;
      await this.updateConnectionState(connection.id, ConnectionState.AUTHENTICATING);
      
      // Connect transport
      await transport.connect(auth);
      
      // Discover tools
      const tools = await transport.discoverTools();
      connection.metadata.tools = tools;
      
      // Update state
      connection.state = ConnectionState.CONNECTED;
      await this.updateConnectionState(connection.id, ConnectionState.CONNECTED);
      
      // Setup event handlers
      transport.on('disconnect', () => this.handleDisconnect(connection.id));
      transport.on('error', (error) => this.handleError(connection.id, error));
      transport.on('message', (message) => this.handleMessage(connection.id, message));
      
    } catch (error) {
      connection.state = ConnectionState.FAILED;
      await this.updateConnectionState(connection.id, ConnectionState.FAILED);
      throw error;
    }
  }

  async executeToolCall(
    connectionId: string,
    toolName: string,
    parameters: any,
    options?: ToolExecutionOptions
  ): Promise<any> {
    const instance = this.connections.get(connectionId);
    if (!instance) {
      throw new Error('Connection not found');
    }

    if (instance.connection.state !== ConnectionState.CONNECTED) {
      throw new Error(`Connection not ready (state: ${instance.connection.state})`);
    }

    const requestId = uuidv4();
    const timeout = options?.timeout || 30000;

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        instance.pendingRequests.delete(requestId);
        reject(new Error(`Tool execution timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      instance.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
      });

      // Execute tool
      instance.transport.executeTool(requestId, toolName, parameters)
        .catch((error) => {
          instance.pendingRequests.delete(requestId);
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  async *streamToolExecution(
    connectionId: string,
    toolName: string,
    parameters: any,
    options?: ToolExecutionOptions
  ): AsyncGenerator<any> {
    const instance = this.connections.get(connectionId);
    if (!instance) {
      throw new Error('Connection not found');
    }

    if (!instance.transport.supportsStreaming()) {
      throw new Error('Service does not support streaming');
    }

    const stream = instance.transport.streamTool(toolName, parameters, options);
    
    for await (const event of stream) {
      yield event;
    }
  }

  private async handleDisconnect(connectionId: string): Promise<void> {
    const instance = this.connections.get(connectionId);
    if (!instance) return;

    instance.connection.state = ConnectionState.DISCONNECTED;
    await this.updateConnectionState(connectionId, ConnectionState.DISCONNECTED);
    
    // Reject all pending requests
    for (const [_, request] of instance.pendingRequests) {
      request.reject(new Error('Connection disconnected'));
    }
    instance.pendingRequests.clear();
    
    this.emit('connection:disconnected', connectionId);
  }

  private async handleError(connectionId: string, error: Error): Promise<void> {
    logger.error(`Connection error for ${connectionId}:`, error);
    
    const instance = this.connections.get(connectionId);
    if (!instance) return;
    
    // Update error rate
    instance.connection.health.errorRate += 0.1;
    
    this.emit('connection:error', { connectionId, error });
  }

  private async handleMessage(connectionId: string, message: any): Promise<void> {
    const instance = this.connections.get(connectionId);
    if (!instance) return;

    // Handle response messages
    if (message.id && instance.pendingRequests.has(message.id)) {
      const request = instance.pendingRequests.get(message.id)!;
      instance.pendingRequests.delete(message.id);
      
      if (message.error) {
        request.reject(new Error(message.error.message));
      } else {
        request.resolve(message.result);
      }
    }
    
    // Handle notifications
    if (!message.id && message.method) {
      this.emit('connection:notification', {
        connectionId,
        method: message.method,
        params: message.params,
      });
    }
  }

  async closeConnection(connectionId: string): Promise<void> {
    const instance = this.connections.get(connectionId);
    if (!instance) return;

    try {
      // Stop health monitoring
      this.healthChecker.stop(connectionId);
      
      // Close transport
      await instance.transport.disconnect();
      
      // Clean up
      this.connections.delete(connectionId);
      await this.removeConnectionFromRedis(connectionId);
      
      this.emit('connection:closed', connectionId);
    } catch (error) {
      logger.error('Error closing connection:', error);
    }
  }

  // Helper methods
  private async getUserConnections(userId: string): Promise<Connection[]> {
    const keys = await this.redis.keys(`connection:${userId}:*`);
    const connections = await Promise.all(
      keys.map(key => this.redis.get(key).then(data => JSON.parse(data!)))
    );
    return connections.filter(c => c.state !== ConnectionState.DISCONNECTED);
  }

  private async getUserConnectionLimit(userId: string): Promise<number> {
    const user = await this.redis.get(`user:${userId}`);
    if (!user) return 3; // Default free tier
    
    const userData = JSON.parse(user);
    const limits = { free: 3, pro: 10, enterprise: 100 };
    return limits[userData.plan] || 3;
  }

  private async saveConnectionToRedis(connection: Connection): Promise<void> {
    const key = `connection:${connection.userId}:${connection.id}`;
    await this.redis.setex(key, 86400, JSON.stringify(connection)); // 24 hour expiry
  }

  private async updateConnectionState(
    connectionId: string, 
    state: ConnectionState
  ): Promise<void> {
    const instance = this.connections.get(connectionId);
    if (!instance) return;
    
    instance.connection.state = state;
    await this.saveConnectionToRedis(instance.connection);
  }

  private async removeConnectionFromRedis(connectionId: string): Promise<void> {
    const pattern = `connection:*:${connectionId}`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

interface ConnectionInstance {
  connection: Connection;
  transport: Transport;
  pendingRequests: Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }>;
}
```

### Phase 3: WebSocket Real-Time Layer (Week 5)

#### 3.1 WebSocket Handler

```typescript
// src/services/websocket/websocket.handler.ts
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/auth.service';
import { ConnectionService } from '../connections/connection.service';
import { logger } from '../../utils/logger';

export class WebSocketHandler extends EventEmitter {
  private ws: WebSocket;
  private userId: string;
  private subscriptions: Set<string> = new Set();
  private heartbeatInterval?: NodeJS.Timer;
  private messageHandlers: Map<string, MessageHandler> = new Map();

  constructor(ws: WebSocket, userId: string) {
    super();
    this.ws = ws;
    this.userId = userId;
    this.setupHandlers();
  }

  async initialize(): Promise<void> {
    // Send welcome message
    this.send({
      type: 'welcome',
      id: uuidv4(),
      timestamp: new Date(),
      payload: {
        userId: this.userId,
        version: '2.0',
        capabilities: ['execute', 'stream', 'subscribe'],
      },
    });

    // Setup heartbeat
    this.startHeartbeat();

    // Setup event listeners
    this.ws.on('message', this.handleMessage.bind(this));
    this.ws.on('close', this.handleClose.bind(this));
    this.ws.on('error', this.handleError.bind(this));
  }

  private setupHandlers(): void {
    // Subscribe handler
    this.messageHandlers.set('subscribe', async (message) => {
      const { events } = message.payload;
      events.forEach((event: string) => this.subscriptions.add(event));
      
      this.send({
        type: 'subscribed',
        id: message.id,
        timestamp: new Date(),
        payload: { events },
      });
    });

    // Unsubscribe handler
    this.messageHandlers.set('unsubscribe', async (message) => {
      const { events } = message.payload;
      events.forEach((event: string) => this.subscriptions.delete(event));
      
      this.send({
        type: 'unsubscribed',
        id: message.id,
        timestamp: new Date(),
        payload: { events },
      });
    });

    // Execute tool handler
    this.messageHandlers.set('execute', async (message) => {
      const { connectionId, toolName, parameters, options } = message.payload;
      
      try {
        const connectionService = await this.getConnectionService();
        const result = await connectionService.executeTool(
          connectionId,
          toolName,
          parameters,
          options
        );
        
        this.send({
          type: 'tool_result',
          id: message.id,
          timestamp: new Date(),
          payload: {
            connectionId,
            toolName,
            result,
            status: 'success',
          },
        });
      } catch (error) {
        this.send({
          type: 'error',
          id: message.id,
          timestamp: new Date(),
          payload: {
            code: 'EXECUTION_ERROR',
            message: error.message,
            details: { connectionId, toolName },
          },
        });
      }
    });

    // Stream tool handler
    this.messageHandlers.set('stream', async (message) => {
      const { connectionId, toolName, parameters, options } = message.payload;
      const streamId = message.id;
      
      try {
        const connectionService = await this.getConnectionService();
        const stream = connectionService.streamTool(
          connectionId,
          toolName,
          parameters,
          options
        );
        
        for await (const event of stream) {
          this.send({
            type: 'stream_event',
            id: streamId,
            timestamp: new Date(),
            payload: {
              connectionId,
              toolName,
              event,
            },
          });
        }
        
        // Send stream complete
        this.send({
          type: 'stream_complete',
          id: streamId,
          timestamp: new Date(),
          payload: {
            connectionId,
            toolName,
          },
        });
      } catch (error) {
        this.send({
          type: 'stream_error',
          id: streamId,
          timestamp: new Date(),
          payload: {
            code: 'STREAM_ERROR',
            message: error.message,
            details: { connectionId, toolName },
          },
        });
      }
    });

    // Ping handler
    this.messageHandlers.set('ping', async (message) => {
      this.send({
        type: 'pong',
        id: message.id,
        timestamp: new Date(),
        payload: {},
      });
    });
  }

  private async handleMessage(data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      if (!message.type || !message.id) {
        throw new Error('Invalid message format');
      }

      const handler = this.messageHandlers.get(message.type);
      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }

      await handler(message);
    } catch (error) {
      logger.error('WebSocket message error:', error);
      this.send({
        type: 'error',
        id: 'error',
        timestamp: new Date(),
        payload: {
          code: 'MESSAGE_ERROR',
          message: error.message,
        },
      });
    }
  }

  private send(message: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public broadcast(event: string, data: any): void {
    if (this.subscriptions.has(event)) {
      this.send({
        type: 'event',
        id: uuidv4(),
        timestamp: new Date(),
        payload: {
          event,
          data,
        },
      });
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // 30 seconds
  }

  private handleClose(): void {
    logger.info(`WebSocket closed for user ${this.userId}`);
    this.cleanup();
  }

  private handleError(error: Error): void {
    logger.error(`WebSocket error for user ${this.userId}:`, error);
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.subscriptions.clear();
    this.emit('close', this.userId);
  }

  private async getConnectionService(): Promise<ConnectionService> {
    // Get service instance (would be injected in real implementation)
    return {} as ConnectionService;
  }
}

type MessageHandler = (message: any) => Promise<void>;
```

### Phase 4: Client SDKs (Week 6)

#### 4.1 TypeScript/JavaScript SDK

```typescript
// packages/sdk-js/src/client.ts
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface NANDAClientConfig {
  apiKey?: string;
  accessToken?: string;
  baseUrl?: string;
  environment?: 'production' | 'staging' | 'development';
  timeout?: number;
  retries?: number;
}

export class NANDAClient extends EventEmitter {
  private config: NANDAClientConfig;
  private http: AxiosInstance;
  private ws?: WebSocket;
  private connections: Map<string, ServiceConnection> = new Map();

  public services: ServicesAPI;
  public auth: AuthAPI;

  constructor(config: NANDAClientConfig) {
    super();
    this.config = {
      baseUrl: config.baseUrl || this.getBaseUrl(config.environment),
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      ...config,
    };

    this.http = this.createHttpClient();
    this.services = new ServicesAPI(this.http);
    this.auth = new AuthAPI(this.http);
  }

  private getBaseUrl(environment?: string): string {
    const urls = {
      production: 'https://api.nanda.ai/v2',
      staging: 'https://staging-api.nanda.ai/v2',
      development: 'http://localhost:3000/v2',
    };
    return urls[environment || 'production'];
  }

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NANDA-SDK-JS/2.0',
      },
    });

    // Add auth interceptor
    client.interceptors.request.use((config) => {
      if (this.config.accessToken) {
        config.headers.Authorization = `Bearer ${this.config.accessToken}`;
      } else if (this.config.apiKey) {
        config.headers['X-API-Key'] = this.config.apiKey;
      }
      return config;
    });

    // Add retry interceptor
    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        if (!config || !config.retry) {
          config.retry = 0;
        }

        if (config.retry >= this.config.retries!) {
          return Promise.reject(error);
        }

        if (error.response?.status >= 500) {
          config.retry += 1;
          const delay = Math.pow(2, config.retry) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return client(config);
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  async connect(serviceId: string, auth?: any): Promise<ServiceConnection> {
    const response = await this.http.post(`/services/${serviceId}/connect`, { auth });
    const connectionData = response.data.data;
    
    const connection = new ServiceConnection(
      this.http,
      connectionData,
      this.config
    );
    
    this.connections.set(connectionData.id, connection);
    
    // Setup WebSocket if not already connected
    if (!this.ws) {
      await this.connectWebSocket();
    }
    
    return connection;
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.config.baseUrl!.replace('https://', 'wss://').replace('http://', 'ws://');
    
    this.ws = new WebSocket(`${wsUrl}/ws`, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    this.ws.on('open', () => {
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleWebSocketMessage(message);
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      this.ws = undefined;
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      this.ws!.once('open', resolve);
      this.ws!.once('error', reject);
    });
  }

  private handleWebSocketMessage(message: any): void {
    if (message.type === 'connection_update') {
      const connection = this.connections.get(message.payload.connectionId);
      if (connection) {
        connection.emit('update', message.payload);
      }
    }
    
    this.emit('message', message);
  }

  async disconnect(): Promise<void> {
    // Close all connections
    for (const connection of this.connections.values()) {
      await connection.close();
    }
    this.connections.clear();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
}

export class ServiceConnection extends EventEmitter {
  constructor(
    private http: AxiosInstance,
    public data: any,
    private config: NANDAClientConfig
  ) {
    super();
  }

  async execute(toolName: string, parameters: any): Promise<any> {
    const response = await this.http.post(
      `/connections/${this.data.id}/tools/${toolName}/execute`,
      { parameters }
    );
    return response.data.data;
  }

  async *stream(toolName: string, parameters: any): AsyncGenerator<any> {
    const response = await this.http.post(
      `/connections/${this.data.id}/tools/${toolName}/stream`,
      { parameters },
      { responseType: 'stream' }
    );

    const reader = response.data;
    let buffer = '';

    for await (const chunk of reader) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          yield data;
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.http.delete(`/connections/${this.data.id}`);
    this.emit('closed');
  }

  on(event: 'update' | 'closed' | 'error', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

export class ServicesAPI {
  constructor(private http: AxiosInstance) {}

  async search(params: {
    query?: string;
    category?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const response = await this.http.get('/services/search', { params });
    return response.data.data;
  }

  async getPopular(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<any> {
    const response = await this.http.get('/services/popular', { 
      params: { timeframe } 
    });
    return response.data.data;
  }

  async getRecommendations(): Promise<any> {
    const response = await this.http.get('/services/recommendations');
    return response.data.data;
  }

  async getById(serviceId: string): Promise<any> {
    const response = await this.http.get(`/services/${serviceId}`);
    return response.data.data;
  }

  async getTools(serviceId: string): Promise<any> {
    const response = await this.http.get(`/services/${serviceId}/tools`);
    return response.data.data;
  }
}

export class AuthAPI {
  constructor(private http: AxiosInstance) {}

  async login(credentials: {
    email?: string;
    password?: string;
    walletAddress?: string;
    signature?: string;
  }): Promise<any> {
    const response = await this.http.post('/auth/login', credentials);
    return response.data.data;
  }

  async refresh(refreshToken: string): Promise<any> {
    const response = await this.http.post('/auth/refresh', { refreshToken });
    return response.data.data;
  }

  async logout(): Promise<void> {
    await this.http.post('/auth/logout');
  }

  async getSession(): Promise<any> {
    const response = await this.http.get('/auth/session');
    return response.data.data;
  }
}
```

## Deployment Strategy

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.9'

services:
  # API Gateway
  gateway:
    build: ./gateway
    ports:
      - "443:443"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - api
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  # Main API Service
  api:
    build: ./api
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/nanda
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure

  # WebSocket Service
  websocket:
    build: ./websocket
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  # Database
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=nanda
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      placement:
        constraints:
          - node.role == manager

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"
    depends_on:
      - prometheus

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

### Kubernetes Configuration

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nanda-api
  namespace: nanda
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nanda-api
  template:
    metadata:
      labels:
        app: nanda-api
    spec:
      containers:
      - name: api
        image: nanda/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: nanda-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: nanda-secrets
              key: redis-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: nanda-api
  namespace: nanda
spec:
  selector:
    app: nanda-api
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nanda-api-hpa
  namespace: nanda
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nanda-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Migration Timeline

### Month 1: Foundation
- Week 1-2: Core HTTP API development
- Week 3-4: Connection management implementation

### Month 2: Real-time & SDKs
- Week 5: WebSocket implementation
- Week 6: Client SDK development
- Week 7-8: Testing and debugging

### Month 3: Production Readiness
- Week 9-10: Performance optimization
- Week 11-12: Security hardening and monitoring

### Month 4: Migration
- Week 13-14: Beta release with select users
- Week 15-16: Full production rollout

## Monitoring & Observability

### Prometheus Metrics

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nanda-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'

  - job_name: 'nanda-websocket'
    static_configs:
      - targets: ['websocket:3000']
    metrics_path: '/metrics'
```

### Custom Metrics Implementation

```typescript
// src/utils/metrics.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsCollector {
  private registry: Registry;
  
  // Counters
  private httpRequests: Counter;
  private wsConnections: Counter;
  private toolExecutions: Counter;
  private errors: Counter;
  
  // Histograms
  private httpDuration: Histogram;
  private toolDuration: Histogram;
  
  // Gauges
  private activeConnections: Gauge;
  private connectionPoolSize: Gauge;

  constructor() {
    this.registry = new Registry();
    
    this.httpRequests = new Counter({
      name: 'nanda_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    
    this.wsConnections = new Counter({
      name: 'nanda_ws_connections_total',
      help: 'Total number of WebSocket connections',
      labelNames: ['event'],
      registers: [this.registry],
    });
    
    this.toolExecutions = new Counter({
      name: 'nanda_tool_executions_total',
      help: 'Total number of tool executions',
      labelNames: ['tool', 'service', 'status'],
      registers: [this.registry],
    });
    
    this.errors = new Counter({
      name: 'nanda_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'code'],
      registers: [this.registry],
    });
    
    this.httpDuration = new Histogram({
      name: 'nanda_http_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    
    this.toolDuration = new Histogram({
      name: 'nanda_tool_duration_seconds',
      help: 'Tool execution duration in seconds',
      labelNames: ['tool', 'service'],
      buckets: [0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
    
    this.activeConnections = new Gauge({
      name: 'nanda_active_connections',
      help: 'Number of active service connections',
      labelNames: ['service'],
      registers: [this.registry],
    });
    
    this.connectionPoolSize = new Gauge({
      name: 'nanda_connection_pool_size',
      help: 'Size of connection pool',
      labelNames: ['user_tier'],
      registers: [this.registry],
    });
  }

  middleware() {
    return (req: any, res: any, next: any) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path;
        
        this.httpRequests.inc({
          method: req.method,
          route,
          status: res.statusCode,
        });
        
        this.httpDuration.observe(
          { method: req.method, route },
          duration
        );
      });
      
      next();
    };
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
```

## Security Implementation

### JWT Service

```typescript
// src/services/auth/jwt.service.ts
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string = '15m';
  private readonly refreshTokenExpiry: string = '7d';

  constructor(private redis: Redis) {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET!;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET!;
  }

  async generateTokens(userId: string, payload: any = {}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const jti = uuidv4();
    
    const accessToken = jwt.sign(
      {
        sub: userId,
        jti,
        type: 'access',
        ...payload,
      },
      this.accessTokenSecret,
      { expiresIn: this.accessTokenExpiry }
    );
    
    const refreshToken = jwt.sign(
      {
        sub: userId,
        jti,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiry }
    );
    
    // Store refresh token in Redis
    await this.redis.setex(
      `refresh_token:${jti}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify({ userId, createdAt: new Date() })
    );
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  async verifyAccessToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret);
      
      // Check if token is blacklisted
      const blacklisted = await this.redis.get(`blacklist:${decoded.jti}`);
      if (blacklisted) {
        throw new Error('Token has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret);
      
      // Check if refresh token exists in Redis
      const stored = await this.redis.get(`refresh_token:${decoded.jti}`);
      if (!stored) {
        throw new Error('Refresh token not found');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async revokeToken(token: string): Promise<void> {
    const decoded = jwt.decode(token) as any;
    if (decoded?.jti) {
      await this.redis.setex(
        `blacklist:${decoded.jti}`,
        decoded.exp - Math.floor(Date.now() / 1000),
        '1'
      );
    }
  }
}
```

This implementation plan provides a comprehensive foundation for transforming NANDA from MCP to a production-ready HTTP-based architecture with extensive examples and best practices.