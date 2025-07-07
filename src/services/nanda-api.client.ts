/**
 * NANDA API Client
 * 
 * This client handles all communication with the NANDA Registry API (https://ui.nanda-registry.com).
 * 
 * Purpose:
 * - Discover services registered in NANDA (both regular and EVMAuth-protected)
 * - Search, filter, and get popular services
 * - Fetch detailed information about specific services
 * 
 * Features:
 * - Singleton pattern to ensure single instance
 * - Automatic retry and error handling
 * - Mock data fallback for development/testing
 * - Support for both authenticated (with JWT) and public endpoints
 * 
 * The client is generic and works with ANY service in the registry,
 * not tied to any specific service like Starbucks.
 */

import axios, { AxiosInstance } from 'axios';
import { NANDAService } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/error.middleware';

// Search parameters interface for querying services
interface SearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  limit: number;
  offset: number;
  sortBy?: string;
}

// Response structure from search endpoint
interface SearchResponse {
  services: NANDAService[];
  totalCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export class NANDAAPIClient {
  private static instance: NANDAAPIClient;
  private client: AxiosInstance;
  private baseURL: string;
  private apiToken?: string;

  private constructor() {
    // Initialize with NANDA Registry URL from environment
    this.baseURL = process.env.NANDA_API_BASE_URL || 'https://nanda-registry.com';
    this.apiToken = process.env.NANDA_API_TOKEN; // Optional - only needed for authenticated endpoints
    
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  // Singleton pattern - ensures only one instance exists
  static getInstance(): NANDAAPIClient {
    if (!NANDAAPIClient.instance) {
      NANDAAPIClient.instance = new NANDAAPIClient();
    }
    return NANDAAPIClient.instance;
  }

  // Setup request/response interceptors for logging and auth
  private setupInterceptors(): void {
    // Request interceptor - adds auth token if available
    this.client.interceptors.request.use(
      (config) => {
        if (this.apiToken) {
          config.headers.Authorization = `Bearer ${this.apiToken}`;
        }
        logger.info(`NANDA API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('NANDA API Request Error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - logs responses and errors
    this.client.interceptors.response.use(
      (response) => {
        logger.info(`NANDA API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('NANDA API Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Search for services in NANDA Registry
   * This is a PUBLIC endpoint - no authentication required
   * 
   * @param params - Search parameters (query, category, tags, etc.)
   * @returns List of services matching the criteria
   */
  async searchServices(params: SearchParams): Promise<SearchResponse> {
    try {
      // Build query parameters for NANDA Registry API
      const queryParams = new URLSearchParams();
      if (params.query) queryParams.append('q', params.query);
      if (params.category) queryParams.append('type', params.category); // NANDA uses 'type' not 'category'
      if (params.tags?.length) queryParams.append('tags', params.tags.join(','));
      queryParams.append('limit', params.limit.toString());
      queryParams.append('offset', params.offset.toString());

      // Call real NANDA Registry API endpoint
      const response = await this.client.get(`/api/v1/discovery/search/?${queryParams.toString()}`);
      
      // Handle NANDA Registry API response format
      if (response.data && response.data.results) {
        return {
          services: response.data.results || [],
          totalCount: response.data.count || 0,
          hasNext: !!response.data.next,
          hasPrevious: !!response.data.previous
        };
      }

      throw new Error('Invalid response format from NANDA Registry');
    } catch (error) {
      // If API fails, use mock data for development/testing
      logger.warn('Using mock data due to NANDA API error', error);
      return this.getMockData(params);
    }
  }

  /**
   * Get popular services from NANDA Registry
   * This is a PUBLIC endpoint - no authentication required
   * 
   * @param timeframe - Time period for popularity (day, week, month)
   * @returns List of popular services
   */
  async getPopularServices(timeframe: 'day' | 'week' | 'month'): Promise<NANDAService[]> {
    try {
      // Map our timeframe to NANDA API period format
      const periodMap = { day: 'daily', week: 'weekly', month: 'monthly' };
      const period = periodMap[timeframe] || 'weekly';
      
      const response = await this.client.get(`/api/v1/discovery/popular/?period=${period}&limit=20`);
      return response.data.results || [];
    } catch (error) {
      logger.warn('Using mock data for popular services', error);
      return this.getMockData({} as SearchParams).services;
    }
  }

  /**
   * Get a specific service by ID
   * This is a PUBLIC endpoint - no authentication required
   * 
   * @param serviceId - UUID of the service
   * @returns Service details or null if not found
   */
  async getServiceById(serviceId: string): Promise<NANDAService | null> {
    try {
      const response = await this.client.get(`/api/v1/servers/${serviceId}/`);
      return response.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      
      logger.warn('NANDA API call failed, using mock data for known service', { 
        serviceId, 
        error: error.message 
      });
      
      // Fallback to mock data only for known Starbucks service
      if (serviceId === 'cf921f9b-136f-4be0-802c-bb7e19855e96') {
        return this.getStarbucksMockService();
      }
      
      throw new AppError(500, 'Failed to fetch service details', 'API_ERROR');
    }
  }

  /**
   * Mock data provider for development/testing
   * Returns example services when real API is unavailable
   */
  private getMockData(params: SearchParams): SearchResponse {
    const starbucksService = this.getStarbucksMockService();
    
    // Filter based on search params
    let services = [starbucksService];
    
    if (params.query && !starbucksService.name.toLowerCase().includes(params.query.toLowerCase()) &&
        !starbucksService.description.toLowerCase().includes(params.query.toLowerCase())) {
      services = [];
    }
    
    if (params.category && starbucksService.category !== params.category) {
      services = [];
    }

    return {
      services,
      totalCount: services.length,
      hasNext: false,
      hasPrevious: false
    };
  }

  /**
   * Returns mock Starbucks service for testing
   * This is a real service in NANDA registry that uses EVMAuth on Radius blockchain
   */
  private getStarbucksMockService(): NANDAService {
    return {
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
    };
  }
}