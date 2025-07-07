import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler } from './api/middleware/error.middleware';
import { logger } from './utils/logger';
import servicesRouter from './api/routes/services.routes';
import connectionsRouter from './api/routes/connections.routes';

// Load environment variables
dotenv.config();

export class NANDAHTTPGateway {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: false, // We'll handle CSP ourselves for Web3 compatibility
    }));

    // CORS - Allow Web3 dApps
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Address'],
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'nanda-http-gateway',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this.app.use('/api/v2/services', servicesRouter);
    this.app.use('/api/v2/connections', connectionsRouter);

    // Welcome route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'NANDA HTTP Gateway',
        description: 'HTTP-based API gateway for NANDA ecosystem with EVMAuth support',
        version: '1.0.0',
        endpoints: {
          services: '/api/v2/services',
          connections: '/api/v2/connections',
          health: '/health'
        }
      });
    });

    // Error handling
    this.app.use(errorHandler);
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      logger.info('New WebSocket connection');
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.info('WebSocket message received', data);
          
          // TODO: Implement WebSocket message handling
          ws.send(JSON.stringify({
            type: 'ack',
            message: 'Message received'
          }));
        } catch (error) {
          logger.error('WebSocket message error', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });
    });
  }

  public async start(): Promise<void> {
    try {
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();

      this.server.listen(this.port, () => {
        logger.info(`NANDA HTTP Gateway running on port ${this.port}`);
        logger.info(`WebSocket available at ws://localhost:${this.port}`);
      });
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }
}

// Start the server
const gateway = new NANDAHTTPGateway();
gateway.start();