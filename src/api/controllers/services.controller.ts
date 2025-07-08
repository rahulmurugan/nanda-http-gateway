import { Request, Response } from 'express';
import { NANDAAPIClient } from '../../services/nanda-api.client';
import { ConnectionManager } from '../../services/connection.manager';
import { logger } from '../../utils/logger';
import { AppError } from '../middleware/error.middleware';

export class ServicesController {
  private nandaClient: NANDAAPIClient;
  private connectionManager: ConnectionManager;

  constructor() {
    this.nandaClient = NANDAAPIClient.getInstance();
    this.connectionManager = ConnectionManager.getInstance();
  }

  async searchServices(req: Request, res: Response): Promise<void> {
    const { q, category, tags, limit, offset, sort } = req.query;

    const result = await this.nandaClient.searchServices({
      query: q as string,
      category: category as string,
      tags: tags ? (tags as string).split(',') : undefined,
      limit: Number(limit),
      offset: Number(offset),
      sortBy: sort as string
    });

    res.json({
      success: true,
      data: result.services,
      meta: {
        total: result.totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasNext: result.hasNext,
        hasPrevious: result.hasPrevious
      }
    });
  }

  async getPopularServices(req: Request, res: Response): Promise<void> {
    const { timeframe = 'week' } = req.query;

    const result = await this.nandaClient.getPopularServices(
      timeframe as 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      data: result
    });
  }

  async getServiceById(req: Request, res: Response): Promise<void> {
    const { serviceId } = req.params;

    const service = await this.nandaClient.getServiceById(serviceId);
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND');
    }

    res.json({
      success: true,
      data: service
    });
  }

  async getServiceTools(req: Request, res: Response): Promise<void> {
    const { serviceId } = req.params;

    const service = await this.nandaClient.getServiceById(serviceId);
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND');
    }

    // Return the tools from service capabilities
    const tools = service.capabilities?.tools || [];

    res.json({
      success: true,
      data: {
        serviceId,
        serviceName: service.name,
        tools: tools.map(toolName => ({
          name: toolName,
          // For EVMAuth services, we know the tool structure
          requiresAuth: service.tags.includes('evmauth'),
          description: this.getToolDescription(toolName, service.name)
        }))
      }
    });
  }

  async connectToService(req: Request, res: Response): Promise<void> {
    const { serviceId } = req.params;
    const { evmAuth, timeout, verifyHealth } = req.body;

    logger.info('Connecting to service', { serviceId, hasEvmAuth: !!evmAuth });

    // Get service details
    const service = await this.nandaClient.getServiceById(serviceId);
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND');
    }

    // Check if service requires EVMAuth
    const requiresEvmAuth = service.tags.includes('evmauth') || 
                           service.tags.includes('blockchain');
    
    if (requiresEvmAuth && !evmAuth) {
      throw new AppError(
        400, 
        'This service requires EVMAuth authentication',
        'EVMAUTH_REQUIRED',
        { 
          requiredFields: ['walletAddress', 'contractAddress', 'tokenId'],
          contractAddress: process.env.EVMAUTH_CONTRACT_ADDRESS
        }
      );
    }

    // Create connection - map NANDA API fields to our internal format
    // Detect transport type - prefer Streamable HTTP (Anthropic's recommended approach)
    const isMCPServer = service.url && (
      service.url.includes('awsapprunner.com') || 
      service.url.includes('3.133.113.164') ||
      service.description?.toLowerCase().includes('sse') ||
      service.description?.toLowerCase().includes('mcp')
    );
    
    // Transport priority: Streamable HTTP > WebSocket > SSE > HTTP
    let transport = service.protocols?.[0] || service.transport_type || 'http';
    if (isMCPServer) {
      transport = 'streamable-http'; // Try Streamable HTTP first (Anthropic's recommended approach)
    }
    
    const connection = await this.connectionManager.createConnection({
      serviceId: service.id,
      serviceName: service.name,
      endpoint: service.url || service.endpoint_url,
      transport: transport,
      evmAuth: evmAuth,
      timeout: timeout,
      verifyHealth: verifyHealth
    });

    res.status(201).json({
      success: true,
      data: {
        connectionId: connection.id,
        serviceId: connection.serviceId,
        serviceName: connection.serviceName,
        state: connection.state,
        transport: connection.transport,
        endpoint: connection.endpoint,
        evmAuth: connection.evmAuth ? {
          walletAddress: connection.evmAuth.walletAddress,
          verified: connection.evmAuth.verified,
          verifiedAt: connection.evmAuth.verifiedAt
        } : undefined,
        tools: connection.metadata.tools,
        createdAt: connection.createdAt
      }
    });
  }

  private getToolDescription(toolName: string, serviceName: string): string {
    // Known tool descriptions
    const descriptions: Record<string, string> = {
      'requestinfo': 'Get company information with EVMAuth verification on Radius blockchain',
      'search': 'Search for information within the service',
      'get': 'Retrieve specific data from the service'
    };

    return descriptions[toolName] || `${toolName} tool for ${serviceName}`;
  }
}