# MCP Server Integration for AI Applications - Technical Report
## Comprehensive Guide to Model Context Protocol Implementation in TypeScript

**Date:** February 15, 2026  
**Author:** Technical Research  
**Target Implementation:** OneMind AI Client Application  
**Language:** TypeScript/Node.js  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [MCP Protocol Fundamentals](#mcp-protocol-fundamentals)
3. [Architecture Overview](#architecture-overview)
4. [Core Components](#core-components)
5. [Implementation Strategies](#implementation-strategies)
6. [TypeScript SDK Usage](#typescript-sdk-usage)
7. [Transport Mechanisms](#transport-mechanisms)
8. [Tool Implementation Patterns](#tool-implementation-patterns)
9. [Resources & Prompts](#resources--prompts)
10. [Capability Discovery](#capability-discovery)
11. [Authentication & Security](#authentication--security)
12. [Error Handling & Resilience](#error-handling--resilience)
13. [Performance & Optimization](#performance--optimization)
14. [Best Practices](#best-practices)
15. [Production Deployment](#production-deployment)
16. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

The Model Context Protocol (MCP) is an open standard that enables AI applications to connect with external systems, tools, and data sources through a standardized interface. MCP separates concerns—the AI model focuses on reasoning while MCP servers handle tool execution and data retrieval.

**Key Benefits for OneMind:**
- **Modular Integration:** Connect to multiple services without duplicating integration logic
- **Dynamic Discovery:** AI automatically discovers available capabilities at runtime
- **Standardized Communication:** JSON-RPC 2.0 protocol ensures interoperability
- **Security by Design:** OAuth 2.0, RBAC, and role-based scopes built into the standard
- **Scalability:** From local STDIO to remote HTTP deployments with multi-client support

**Implementation Scope:**
- Build MCP client integration into OneMind's core AI engine
- Support both local (STDIO) and remote (HTTP) server connections
- Implement dynamic tool discovery and capability negotiation
- Add comprehensive error handling, rate limiting, and security controls
- Enable seamless tool invocation from the AI's reasoning loop

---

## MCP Protocol Fundamentals

### 1. Core Concepts

**MCP is fundamentally about three things:**

1. **Capability Exposure:** Servers tell clients what they can do
2. **Request/Response Flow:** Clients request actions, servers execute them
3. **Data Grounding:** AI gets access to real-time, contextual information

### 2. Protocol Specification

**Message Format:** JSON-RPC 2.0  
**Session Type:** Stateful (persistent connection per server)  
**Transport Agnostic:** Works over STDIO, HTTP, WebSockets, or custom protocols  
**Bidirectional:** Both client→server and server→client communication

### 3. Message Structure

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1,
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "send_email",
        "description": "Send an email message",
        "inputSchema": {
          "type": "object",
          "properties": {
            "recipient": { "type": "string" },
            "subject": { "type": "string" },
            "body": { "type": "string" }
          },
          "required": ["recipient", "subject", "body"]
        }
      }
    ]
  },
  "id": 1
}
```

---

## Architecture Overview

### Client-Host-Server Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Host (OneMind)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    AI Engine / LLM                        │   │
│  │         (Reasoning, Context Management, Planning)         │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │                                              │
│  ┌────────────────▼─────────────────────────────────────────┐   │
│  │         MCP Client Instance Manager                       │   │
│  │  - Lifecycle management (1 per server)                   │   │
│  │  - Connection pooling                                    │   │
│  │  - Protocol negotiation                                  │   │
│  │  - Session orchestration                                 │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │                                              │
│    ┌──────────────┼──────────────┬─────────────────┐            │
│    │              │              │                 │            │
└────┼──────────────┼──────────────┼─────────────────┼────────────┘
     │              │              │                 │
     ▼              ▼              ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ MCP SERVER 1   │ MCP SERVER 2   │ MCP SERVER 3  │  MCP SERVER N │
│ (STDIO)        │ (HTTP Remote)  │ (STDIO)       │  (HTTP)       │
│ - Tools        │ - Tools        │ - Tools       │  - Tools      │
│ - Resources    │ - Resources    │ - Resources   │  - Resources  │
│ - Prompts      │ - Prompts      │ - Prompts     │  - Prompts    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- Each MCP server connection is isolated and maintains its own state
- The host (OneMind) orchestrates multiple client instances
- Full conversation history and context stays with the host
- Servers only receive context they need for their task
- Security boundaries between servers are enforced

---

## Core Components

### 1. MCP Client

**Responsibilities:**
- Establish and maintain connection with a single MCP server
- Handle protocol negotiation and capability exchange
- Route requests and responses through transport
- Manage subscriptions and notifications
- Maintain security boundaries

**Key Methods:**
```typescript
- client.tools() - List available tools
- client.resources() - List available resources
- client.prompts() - List available prompts
- client.callTool(name, args) - Execute a tool
- client.readResource(uri) - Access a resource
- client.getPrompt(name, args) - Get prompt content
```

### 2. Transport Layer

**STDIO Transport (Local)**
- Spawns server as child process
- Communication via stdin/stdout
- Each message terminated with newline
- No network overhead
- Ideal for local tools, single-user scenarios

**Streamable HTTP Transport (Remote)**
- HTTP POST for client→server
- Server-Sent Events (SSE) for server→client streaming
- Supports multiple concurrent clients
- Standard HTTP authentication (Bearer tokens, API keys)
- Recommended for cloud/remote deployments

### 3. Capability System

**Three Core Primitives:**

| Primitive | Control | Purpose | Example |
|-----------|---------|---------|---------|
| **Tools** | Model-controlled | Executable functions | `send_slack_message`, `query_database` |
| **Resources** | Application-controlled | Read-only context data | File contents, code snippets, logs |
| **Prompts** | User-controlled | Pre-templated interactions | "Analyze git history", "Generate report" |

### 4. Session Management

```typescript
interface MCPSession {
  // Connection state
  isConnected: boolean;
  protocolVersion: string;
  
  // Capabilities
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  
  // Negotiation
  clientInfo: ClientCapabilities;
  serverInfo: ServerCapabilities;
  
  // Request tracking
  pendingRequests: Map<number, PendingRequest>;
  requestIdCounter: number;
}
```

---

## Implementation Strategies

### Strategy 1: Minimal Integration (Client-Only)

**Use Case:** Connect OneMind to existing MCP servers without building your own  
**Effort:** Low (2-4 weeks)  
**Benefits:** Quick time-to-value, leverage existing ecosystem

**Components:**
1. MCP Client adapter layer
2. Tool discovery and registration
3. Request/response mapping
4. Error handling

### Strategy 2: Server & Client Integration

**Use Case:** Build OneMind-specific MCP servers + integrate external servers  
**Effort:** Medium (6-8 weeks)  
**Benefits:** Custom tools tailored to OneMind's domain, full control

**Components:**
1. MCP Server framework setup
2. Tool implementation layer
3. Resource exposure
4. Prompt templates
5. Client integration
6. Authentication & security

### Strategy 3: Enterprise Deployment

**Use Case:** Multi-tenant, secure, auditable MCP infrastructure  
**Effort:** High (10-14 weeks)  
**Benefits:** Production-grade, scalable, compliant

**Components:**
1. Server framework + security hardening
2. OAuth 2.0 + RBAC implementation
3. Rate limiting & monitoring
4. Containerized deployment (Docker, ACI, ECS)
5. Client pooling & connection management
6. Audit logging
7. Private registry for server management

---

## TypeScript SDK Usage

### Installation

```bash
npm install @modelcontextprotocol/sdk
npm install --save-dev @types/node typescript
```

### Client Connection (HTTP Remote)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function connectToMCPServer(serverUrl: string, token?: string) {
  // Configure HTTP transport with optional authentication
  const transport = new StreamableHTTPClientTransport({
    url: new URL(serverUrl),
    headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
  });

  // Create client
  const client = new Client({
    name: 'oneMind-client',
    version: '1.0.0'
  });

  // Connect
  await client.connect(transport);

  // Perform capability exchange
  const handshake = await client.initialize();
  console.log('Connected to server:', handshake.serverInfo);

  return { client, transport };
}
```

### Tool Discovery & Execution

```typescript
import { Tool } from '@modelcontextprotocol/sdk/shared/types.js';

async function discoverTools(client: Client): Promise<Tool[]> {
  const response = await client.request(
    { 
      method: 'tools/list',
      params: {} 
    }
  );
  return response.result?.tools || [];
}

async function executeToolWithSchema(
  client: Client, 
  toolName: string, 
  args: Record<string, unknown>
) {
  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }
    );

    // Handle execution success
    if (result.result?.isError) {
      throw new Error(`Tool error: ${result.result.content[0]?.text}`);
    }

    return result.result;
  } catch (error) {
    // Error handling (see section: Error Handling & Resilience)
    throw new Error(`Failed to execute tool ${toolName}: ${error.message}`);
  }
}
```

### Resource Access

```typescript
import { TextContent, ImageContent } from '@modelcontextprotocol/sdk/shared/types.js';

async function getResource(client: Client, resourceUri: string) {
  const response = await client.request(
    {
      method: 'resources/read',
      params: {
        uri: resourceUri
      }
    }
  );

  const contents = response.result?.contents || [];
  
  // Handle different content types
  contents.forEach(content => {
    if (content.type === 'text') {
      console.log('Text:', (content as TextContent).text);
    } else if (content.type === 'image') {
      console.log('Image:', (content as ImageContent).data);
    }
  });

  return contents;
}
```

### Prompt Template Access

```typescript
import { GetPromptRequest } from '@modelcontextprotocol/sdk/shared/types.js';

async function getPromptTemplate(
  client: Client,
  promptName: string,
  arguments_?: Record<string, string>
) {
  const response = await client.request(
    {
      method: 'prompts/get',
      params: {
        name: promptName,
        arguments: arguments_
      }
    }
  );

  // Response contains prompt with embedded resources
  return response.result;
}
```

---

## Transport Mechanisms

### STDIO Transport (Local Servers)

**Best for:**
- Local development
- Claude Desktop integration
- Command-line tools
- Single-user applications
- Minimal latency requirement

**Implementation:**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connectToLocalServer(serverPath: string) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      // Pass any env vars needed by the server
      API_KEY: process.env.MCP_API_KEY
    }
  });

  const client = new Client({
    name: 'oneMind-local-client',
    version: '1.0.0'
  });

  await client.connect(transport);
  return client;
}
```

**Lifecycle:**
- Client spawns server process on demand
- Server runs for duration of connection
- Process terminated when client closes
- Ideal for stateless, request-response interactions

### Streamable HTTP Transport (Remote Servers)

**Best for:**
- Cloud deployments
- Multi-client scenarios
- Long-lived servers
- Enterprise deployments
- Cross-machine communication

**Implementation:**

```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function connectToRemoteServer(
  serverUrl: string,
  authToken?: string,
  sseSupport: boolean = true
) {
  const transport = new StreamableHTTPClientTransport({
    url: new URL(serverUrl),
    
    // HTTP authentication methods
    headers: authToken 
      ? { 'Authorization': `Bearer ${authToken}` }
      : {
          'X-API-Key': process.env.MCP_API_KEY,
          'User-Agent': 'OneMind/1.0'
        },
    
    // Request timeout
    timeout: 30000,
    
    // SSE support for streaming responses
    enableSSE: sseSupport
  });

  const client = new Client({
    name: 'oneMind-remote-client',
    version: '1.0.0'
  });

  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    await transport.close();
    throw error;
  }
}
```

**Message Flow:**

```
Client                           Server
  │                                │
  │─── POST /mcp/message ────────► │
  │    (JSON-RPC request)          │
  │                                │
  │ ◄─── SSE stream response ──────│
  │    (one or more JSON objects)   │
  │                                │
  │─── GET /mcp/events ──────────► │ (optional)
  │ ◄─── SSE persistent stream ────│
  │    (server-initiated messages)  │
```

**Production Considerations:**
- Use HTTPS for sensitive data
- Implement request signing for extra security
- Set appropriate timeouts (default: 30s recommended)
- Use connection pooling for high concurrency
- Add retry logic with exponential backoff

### Transport Comparison Matrix

| Aspect | STDIO | HTTP Streamable |
|--------|-------|-----------------|
| **Latency** | Minimal | 1-50ms overhead |
| **Scalability** | Single-user | Multi-client |
| **Network** | Local only | Remote capable |
| **Authentication** | Process-level | OAuth 2.0, Bearer tokens |
| **Deployment** | Simple | Containerized |
| **Streaming** | Native | SSE-based |
| **Cost** | Minimal | Server/network costs |

---

## Tool Implementation Patterns

### Pattern 1: Simple Tool Definition

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

// Example: Send Slack Message
const sendSlackMessageTool: Tool = {
  name: 'send_slack_message',
  description: 'Send a message to a Slack channel',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Slack channel name or ID'
      },
      message: {
        type: 'string',
        description: 'Message content'
      },
      thread_ts: {
        type: 'string',
        description: 'Optional: Thread timestamp for replies'
      }
    },
    required: ['channel', 'message']
  }
};
```

### Pattern 2: Tool with Structured Output

```typescript
import { z } from 'zod';

// Define output schema
const QueryResultSchema = z.object({
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number(),
  executionTime: z.number(),
  query: z.string()
});

async function handleQueryDatabaseTool(
  sql: string,
  params?: unknown[]
): Promise<{ structuredContent: typeof QueryResultSchema._type }> {
  const startTime = Date.now();
  
  // Execute query (implementation depends on your DB)
  const result = await database.query(sql, params);
  
  const output = {
    rows: result.rows,
    rowCount: result.rows.length,
    executionTime: Date.now() - startTime,
    query: sql
  };

  // Validate against schema
  const validated = QueryResultSchema.parse(output);
  
  return {
    structuredContent: validated
  };
}
```

### Pattern 3: Tool with Async Context Sampling

```typescript
interface LLMSamplingRequest {
  modelName?: string;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

async function handleToolWithAISampling(
  client: Client,
  context: string
): Promise<string> {
  // Request the AI model for analysis through LLM sampling
  const samplingResult = await client.request({
    method: 'sampling/createMessage',
    params: {
      maxTokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze this context and provide recommendations:\n\n${context}`
        }
      ]
    }
  });

  return samplingResult.result?.content[0]?.text || '';
}
```

### Pattern 4: Batch Tool Operations

```typescript
interface BatchToolRequest {
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  stopOnError?: boolean;
}

async function executeBatchTools(
  client: Client,
  requests: BatchToolRequest['tools'],
  stopOnError = false
): Promise<Array<{ success: boolean; result?: unknown; error?: string }>> {
  const results = [];

  for (const request of requests) {
    try {
      const result = await executeToolWithSchema(client, request.name, request.args);
      results.push({ success: true, result });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ success: false, error: errorMsg });
      
      if (stopOnError) break;
    }
  }

  return results;
}
```

### Pattern 5: Tool with Validation & Constraints

```typescript
interface ToolExecutionContext {
  userId: string;
  userRole: string;
  rateLimit: number; // calls per minute
  costLimit: number; // cents per hour
}

class ToolExecutor {
  private callCounts = new Map<string, number>();
  private costTracking = new Map<string, number>();

  async executeWithConstraints(
    client: Client,
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ) {
    // Check rate limit
    const callCount = this.callCounts.get(context.userId) || 0;
    if (callCount >= context.rateLimit) {
      throw new Error(`Rate limit exceeded for user ${context.userId}`);
    }

    // Check cost limit
    const currentCost = this.costTracking.get(context.userId) || 0;
    const estimatedCost = this.estimateToolCost(toolName);
    if (currentCost + estimatedCost > context.costLimit) {
      throw new Error(`Cost limit exceeded for user ${context.userId}`);
    }

    // Validate access based on role
    if (!this.canAccessTool(toolName, context.userRole)) {
      throw new Error(`User role ${context.userRole} cannot access ${toolName}`);
    }

    // Execute tool
    const result = await executeToolWithSchema(client, toolName, args);

    // Update tracking
    this.callCounts.set(context.userId, callCount + 1);
    this.costTracking.set(context.userId, currentCost + estimatedCost);

    return result;
  }

  private estimateToolCost(toolName: string): number {
    const costs: Record<string, number> = {
      'send_email': 1,
      'query_database': 10,
      'api_call': 25,
      'generate_report': 50
    };
    return costs[toolName] || 5;
  }

  private canAccessTool(toolName: string, role: string): boolean {
    const rolePermissions: Record<string, string[]> = {
      'viewer': ['query_database'],
      'editor': ['query_database', 'send_email'],
      'admin': ['query_database', 'send_email', 'api_call', 'generate_report']
    };
    return rolePermissions[role]?.includes(toolName) ?? false;
  }
}
```

---

## Resources & Prompts

### Resources: Read-Only Context Data

**Use Cases:**
- File contents (code, logs, documentation)
- Database records (queries, tables)
- Git history
- API documentation
- Configuration data

**Implementation:**

```typescript
interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Server-side: Define available resources
const resources: Resource[] = [
  {
    uri: 'file://project/README.md',
    name: 'Project Documentation',
    description: 'Main README file',
    mimeType: 'text/markdown'
  },
  {
    uri: 'db://users/active',
    name: 'Active Users',
    description: 'List of currently active users',
    mimeType: 'application/json'
  }
];

// Client-side: Read resource
async function readProjectDocumentation(client: Client) {
  const response = await client.request({
    method: 'resources/read',
    params: {
      uri: 'file://project/README.md'
    }
  });

  return response.result?.contents[0]?.text;
}

// Subscribe to resource updates (optional)
async function subscribeToUserUpdates(client: Client) {
  const response = await client.request({
    method: 'resources/subscribe',
    params: {
      uri: 'db://users/active'
    }
  });
}
```

**Resource Discovery:**

```typescript
async function listResources(client: Client): Promise<Resource[]> {
  const response = await client.request({
    method: 'resources/list',
    params: {}
  });

  return response.result?.resources || [];
}

// Optional: Template-based discovery (pattern matching)
async function listResourcesByPattern(
  client: Client,
  uriPattern: string
): Promise<Resource[]> {
  const response = await client.request({
    method: 'resources/list',
    params: {
      uriPattern
    }
  });

  return response.result?.resources || [];
}
```

### Prompts: User-Controlled Interactions

**Use Cases:**
- Slash commands ("/analyze_git_history")
- Workflow templates
- Task presets
- Guided interactions
- Domain-specific queries

**Implementation:**

```typescript
interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// Server-side: Define prompts
const prompts: Prompt[] = [
  {
    name: 'analyze_git_history',
    description: 'Analyze git repository history and provide insights',
    arguments: [
      {
        name: 'branch',
        description: 'Git branch to analyze',
        required: false
      },
      {
        name: 'since',
        description: 'Analyze commits since this date (ISO 8601)',
        required: false
      }
    ]
  },
  {
    name: 'code_review',
    description: 'Review code and provide feedback',
    arguments: [
      {
        name: 'filePath',
        description: 'Path to file to review',
        required: true
      },
      {
        name: 'reviewType',
        description: 'Type of review: security, performance, style',
        required: false
      }
    ]
  }
];

// Client-side: Get prompt content
async function getGitAnalysisPrompt(
  client: Client,
  branch?: string,
  since?: string
) {
  const response = await client.request({
    method: 'prompts/get',
    params: {
      name: 'analyze_git_history',
      arguments: {
        ...(branch && { branch }),
        ...(since && { since })
      }
    }
  });

  // Response contains expanded prompt with resources embedded
  const promptText = response.result?.messages[0]?.content;
  return promptText;
}

// List available prompts
async function listPrompts(client: Client): Promise<Prompt[]> {
  const response = await client.request({
    method: 'prompts/list',
    params: {}
  });

  return response.result?.prompts || [];
}
```

### Integrated Workflow: Resources + Prompts + Tools

```typescript
async function executeAnalysisWorkflow(
  client: Client,
  repository: string
) {
  // Step 1: Get prompt with embedded resources
  const prompt = await getGitAnalysisPrompt(
    client,
    'main'
  );

  // Step 2: Execute analysis tool with prompt context
  const analysis = await executeToolWithSchema(
    client,
    'analyze_git_repository',
    {
      repository,
      prompt
    }
  );

  // Step 3: Read related resource for additional context
  const documentation = await readProjectDocumentation(client);

  // Step 4: Use analysis + documentation for final synthesis
  return {
    analysis,
    documentation,
    combinedInsights: `${analysis} Based on documentation: ${documentation}`
  };
}
```

---

## Capability Discovery

### Dynamic Capability Exchange

**At Connection Initialization:**

```typescript
interface ClientCapabilities {
  experimental?: boolean;
  sampling?: boolean;
  logging?: boolean;
}

interface ServerCapabilities {
  logging?: object;
  tools?: object;
  resources?: object;
  prompts?: object;
}

async function performCapabilityNegotiation(client: Client) {
  const initResponse = await client.request({
    method: 'initialize',
    params: {
      clientInfo: {
        name: 'OneMind',
        version: '1.0.0'
      },
      capabilities: {
        experimental: true,
        sampling: true,
        logging: true
      }
    }
  });

  const serverCapabilities = initResponse.result?.capabilities;
  const serverInfo = initResponse.result?.serverInfo;

  return {
    serverCapabilities,
    serverInfo,
    protocolVersion: initResponse.result?.protocolVersion
  };
}
```

### Capability Registry

```typescript
class CapabilityRegistry {
  private capabilities = new Map<string, any>();

  register(serverName: string, capabilities: ServerCapabilities) {
    this.capabilities.set(serverName, capabilities);
  }

  canCallTools(serverName: string): boolean {
    return !!this.capabilities.get(serverName)?.tools;
  }

  canAccessResources(serverName: string): boolean {
    return !!this.capabilities.get(serverName)?.resources;
  }

  canUsePrompts(serverName: string): boolean {
    return !!this.capabilities.get(serverName)?.prompts;
  }

  canSample(serverName: string): boolean {
    return !!this.capabilities.get(serverName)?.sampling;
  }

  listTools(serverName: string): string[] {
    const cap = this.capabilities.get(serverName);
    return cap?.tools?.map((t: Tool) => t.name) || [];
  }

  getToolDetails(serverName: string, toolName: string): Tool | undefined {
    const cap = this.capabilities.get(serverName);
    return cap?.tools?.find((t: Tool) => t.name === toolName);
  }
}
```

### Capability-Aware Tool Selection

```typescript
class IntelligentToolSelector {
  constructor(private registry: CapabilityRegistry) {}

  async findBestServer(
    requiredCapability: string,
    toolNamePattern: string
  ): Promise<string | undefined> {
    for (const [serverName, caps] of this.registry.capabilities.entries()) {
      const hasCapability = 
        requiredCapability === 'tools' ? this.registry.canCallTools(serverName) :
        requiredCapability === 'resources' ? this.registry.canAccessResources(serverName) :
        requiredCapability === 'prompts' ? this.registry.canUsePrompts(serverName) :
        false;

      if (!hasCapability) continue;

      const tools = this.registry.listTools(serverName);
      if (tools.some(t => t.match(toolNamePattern))) {
        return serverName;
      }
    }

    return undefined;
  }

  async selectToolByCapability(
    toolPurpose: string,
    availableServers: string[]
  ): Promise<{ server: string; tool: Tool } | undefined> {
    // Match tool purpose to available capabilities
    const toolName = this.purposeToToolMapping(toolPurpose);

    for (const serverName of availableServers) {
      const toolDetails = this.registry.getToolDetails(serverName, toolName);
      if (toolDetails) {
        return { server: serverName, tool: toolDetails };
      }
    }

    return undefined;
  }

  private purposeToToolMapping(purpose: string): string {
    const mappings: Record<string, string> = {
      'send_notification': 'send_slack_message',
      'query_data': 'query_database',
      'create_artifact': 'create_file',
      'analyze_code': 'analyze_code_quality'
    };
    return mappings[purpose] || purpose;
  }
}
```

---

## Authentication & Security

### OAuth 2.0 + PKCE Flow

**Implementation:**

```typescript
import { TokenSet } from 'oauth4webapi';

interface OAuthConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

class OAuthManager {
  private config: OAuthConfig;
  private tokenCache: TokenSet | null = null;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if valid
    if (this.tokenCache && this.isTokenValid(this.tokenCache)) {
      return this.tokenCache.access_token!;
    }

    // Refresh or obtain new token
    const newToken = await this.refreshToken();
    this.tokenCache = newToken;
    return newToken.access_token!;
  }

  private isTokenValid(token: TokenSet): boolean {
    if (!token.expires_at) return false;
    const expiryTime = token.expires_at * 1000;
    const bufferTime = 60000; // 1 minute buffer
    return Date.now() < (expiryTime - bufferTime);
  }

  private async refreshToken(): Promise<TokenSet> {
    // Implementation depends on OAuth provider
    // This is a placeholder structure
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: this.config.scopes.join(' ')
      })
    });

    const data = await response.json();
    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in
    };
  }
}
```

### Role-Based Access Control (RBAC)

```typescript
interface UserRole {
  id: string;
  name: string;
  permissions: Set<string>;
}

interface AccessPolicy {
  toolName: string;
  requiredRoles: string[];
  minPermissions: string[];
}

class RBACEnforcer {
  private policies = new Map<string, AccessPolicy>();

  registerPolicy(toolName: string, policy: AccessPolicy) {
    this.policies.set(toolName, policy);
  }

  canExecuteTool(
    toolName: string,
    userRole: UserRole
  ): { allowed: boolean; reason?: string } {
    const policy = this.policies.get(toolName);
    if (!policy) {
      return { allowed: false, reason: 'Tool policy not defined' };
    }

    // Check role eligibility
    if (!policy.requiredRoles.includes(userRole.name)) {
      return {
        allowed: false,
        reason: `User role '${userRole.name}' not in required roles`
      };
    }

    // Check permission requirements
    const hasAllPermissions = policy.minPermissions.every(
      perm => userRole.permissions.has(perm)
    );
    if (!hasAllPermissions) {
      return {
        allowed: false,
        reason: 'User missing required permissions'
      };
    }

    return { allowed: true };
  }
}

// Define policies
const rbacEnforcer = new RBACEnforcer();

rbacEnforcer.registerPolicy('send_email', {
  toolName: 'send_email',
  requiredRoles: ['editor', 'admin'],
  minPermissions: ['write:communications', 'write:external']
});

rbacEnforcer.registerPolicy('query_database', {
  toolName: 'query_database',
  requiredRoles: ['viewer', 'editor', 'admin'],
  minPermissions: ['read:data']
});

rbacEnforcer.registerPolicy('system_config', {
  toolName: 'system_config',
  requiredRoles: ['admin'],
  minPermissions: ['write:config', 'write:system']
});
```

### Request Signing for HTTP Transport

```typescript
import crypto from 'crypto';

class RequestSigner {
  constructor(private apiKey: string, private apiSecret: string) {}

  signRequest(method: string, path: string, body?: unknown): string {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    
    const signatureSource = [
      method,
      path,
      timestamp,
      bodyStr
    ].join('\n');

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signatureSource)
      .digest('hex');

    return `${this.apiKey}:${timestamp}:${signature}`;
  }

  verifyRequestSignature(
    signature: string,
    method: string,
    path: string,
    timestamp: string,
    body?: unknown
  ): boolean {
    const expectedSignature = this.signRequest(method, path, body);
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }
}
```

---

## Error Handling & Resilience

### Error Categories

```typescript
enum MCPErrorType {
  PROTOCOL_ERROR = 'ProtocolError',
  TRANSPORT_ERROR = 'TransportError',
  TOOL_ERROR = 'ToolExecutionError',
  AUTHENTICATION_ERROR = 'AuthenticationError',
  RATE_LIMIT_ERROR = 'RateLimitError',
  TIMEOUT_ERROR = 'TimeoutError',
  VALIDATION_ERROR = 'ValidationError'
}

interface MCPError extends Error {
  type: MCPErrorType;
  code?: string;
  statusCode?: number;
  isRetryable: boolean;
  originalError?: Error;
}
```

### Comprehensive Error Handler

```typescript
class MCPErrorHandler {
  private errorCounts = new Map<string, { count: number; lastReset: number }>();
  private readonly errorThreshold = 5;
  private readonly timeWindow = 60000; // 1 minute

  handleError(error: unknown): MCPError {
    if (error instanceof MCPError) {
      return error;
    }

    if (error instanceof Error) {
      return this.categorizeError(error);
    }

    return {
      name: 'UnknownMCPError',
      message: String(error),
      type: MCPErrorType.PROTOCOL_ERROR,
      isRetryable: false
    } as MCPError;
  }

  private categorizeError(error: Error): MCPError {
    const message = error.message.toLowerCase();
    
    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        name: error.name,
        message: error.message,
        type: MCPErrorType.AUTHENTICATION_ERROR,
        statusCode: 401,
        isRetryable: false
      } as MCPError;
    }

    if (message.includes('429') || message.includes('rate limit')) {
      return {
        name: error.name,
        message: error.message,
        type: MCPErrorType.RATE_LIMIT_ERROR,
        statusCode: 429,
        isRetryable: true
      } as MCPError;
    }

    if (message.includes('timeout')) {
      return {
        name: error.name,
        message: error.message,
        type: MCPErrorType.TIMEOUT_ERROR,
        isRetryable: true
      } as MCPError;
    }

    if (message.includes('connection')) {
      return {
        name: error.name,
        message: error.message,
        type: MCPErrorType.TRANSPORT_ERROR,
        isRetryable: true
      } as MCPError;
    }

    return {
      name: error.name,
      message: error.message,
      type: MCPErrorType.PROTOCOL_ERROR,
      isRetryable: false,
      originalError: error
    } as MCPError;
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: MCPError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const mcpError = this.handleError(error);
        lastError = mcpError;

        if (!mcpError.isRetryable || attempt === maxRetries) {
          throw mcpError;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `Operation '${operationName}' failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  checkCircuitBreaker(operationName: string): void {
    const stats = this.errorCounts.get(operationName);

    if (!stats) {
      return;
    }

    const now = Date.now();
    if (now - stats.lastReset > this.timeWindow) {
      // Reset after time window
      stats.count = 0;
      stats.lastReset = now;
      return;
    }

    if (stats.count >= this.errorThreshold) {
      throw new Error(
        `Circuit breaker open for operation '${operationName}'. Too many failures in recent window.`
      );
    }
  }

  recordError(operationName: string): void {
    const stats = this.errorCounts.get(operationName) || {
      count: 0,
      lastReset: Date.now()
    };
    stats.count++;
    this.errorCounts.set(operationName, stats);
  }
}
```

### Graceful Degradation

```typescript
class MCPClientWithFallback {
  private primaryClient: Client | null = null;
  private fallbackClient: Client | null = null;

  async executeToolWithFallback(
    toolName: string,
    args: Record<string, unknown>
  ) {
    try {
      return await executeToolWithSchema(this.primaryClient!, toolName, args);
    } catch (error) {
      console.warn(`Primary execution failed for ${toolName}, trying fallback...`);

      if (this.fallbackClient) {
        try {
          return await executeToolWithSchema(this.fallbackClient, toolName, args);
        } catch (fallbackError) {
          throw new Error(
            `Both primary and fallback failed for ${toolName}: ` +
            `${error} | Fallback: ${fallbackError}`
          );
        }
      }

      throw error;
    }
  }

  async executeWithCircuitBreaker(
    operationName: string,
    operation: () => Promise<unknown>
  ) {
    const errorHandler = new MCPErrorHandler();

    try {
      errorHandler.checkCircuitBreaker(operationName);
      const result = await errorHandler.executeWithRetry(
        operation,
        operationName
      );
      return result;
    } catch (error) {
      errorHandler.recordError(operationName);
      throw error;
    }
  }
}
```

---

## Performance & Optimization

### Connection Pooling

```typescript
class MCPClientPool {
  private clients = new Map<string, Client>();
  private connections = new Map<string, { transport: any; refCount: number }>();
  private maxPoolSize = 10;

  async getOrCreateClient(serverUrl: string, token?: string): Promise<Client> {
    // Return existing client
    if (this.clients.has(serverUrl)) {
      return this.clients.get(serverUrl)!;
    }

    // Check pool size
    if (this.clients.size >= this.maxPoolSize) {
      throw new Error('MCP client pool exhausted');
    }

    // Create new connection
    const transport = new StreamableHTTPClientTransport({
      url: new URL(serverUrl),
      headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
    });

    const client = new Client({
      name: 'oneMind-pooled-client',
      version: '1.0.0'
    });

    await client.connect(transport);
    this.clients.set(serverUrl, client);
    this.connections.set(serverUrl, { transport, refCount: 1 });

    return client;
  }

  releaseClient(serverUrl: string): void {
    const conn = this.connections.get(serverUrl);
    if (conn) {
      conn.refCount--;
      if (conn.refCount === 0) {
        this.clients.delete(serverUrl);
        this.connections.delete(serverUrl);
      }
    }
  }

  async closeAllClients(): Promise<void> {
    const closePromises = Array.from(this.clients.values()).map(
      client => client.close()
    );
    await Promise.all(closePromises);
    this.clients.clear();
    this.connections.clear();
  }
}
```

### Caching Layer for Tool Discovery

```typescript
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class MCPCacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, value: T, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  invalidate(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Batch Request Optimization

```typescript
class BatchRequestOptimizer {
  private queue: Array<{
    toolName: string;
    args: Record<string, unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: any) => void;
  }> = [];

  private batchSize = 10;
  private batchTimeout = 100; // ms

  async addRequest(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ toolName, args, resolve, reject });

      if (this.queue.length >= this.batchSize) {
        this.processBatch();
      }
    });
  }

  private processBatch(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    // Process batch of requests
  }
}
```

---

## Best Practices

### 1. Connection Management

```typescript
// ✅ DO: Use connection pooling and proper cleanup
class ManagedMCPClient {
  private client: Client | null = null;

  async initialize(serverUrl: string) {
    try {
      this.client = await this.pool.getOrCreateClient(serverUrl);
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  async cleanup() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

// ❌ DON'T: Create new connections for every request
for (const request of requests) {
  const client = new Client(...);
  await client.connect(...);
  // ... use client
}
```

### 2. Error Handling

```typescript
// ✅ DO: Implement comprehensive error handling
async function executeToolSafely(
  client: Client,
  toolName: string,
  args: Record<string, unknown>
) {
  try {
    return await executeToolWithSchema(client, toolName, args);
  } catch (error) {
    if (error instanceof MCPError) {
      if (error.isRetryable) {
        // Implement retry logic
      } else {
        // Log and fail fast
        logger.error(`Non-retryable error: ${error.message}`);
      }
    }
    throw error;
  }
}

// ❌ DON'T: Ignore errors or use generic catch-all
try {
  await executeToolWithSchema(client, toolName, args);
} catch (error) {
  // Silent failure
}
```

### 3. Security Patterns

```typescript
// ✅ DO: Validate and sanitize inputs
function validateToolArgs(
  toolName: string,
  schema: JSONSchema,
  args: Record<string, unknown>
): boolean {
  // Validate against JSON schema
  // Sanitize string inputs
  // Check constraints
  return true;
}

// ✅ DO: Use OAuth tokens with expiration
const token = await oauthManager.getAccessToken();
const transport = new StreamableHTTPClientTransport({
  url: new URL(serverUrl),
  headers: { 'Authorization': `Bearer ${token}` }
});

// ❌ DON'T: Hardcode credentials
const transport = new StreamableHTTPClientTransport({
  url: new URL(serverUrl),
  headers: { 'X-API-Key': 'sk-...' } // ❌ BAD
});
```

### 4. Capability Awareness

```typescript
// ✅ DO: Check capabilities before using features
const registry = new CapabilityRegistry();
if (registry.canCallTools(serverName)) {
  const tool = registry.getToolDetails(serverName, 'send_email');
  if (tool) {
    // Use tool
  }
}

// ❌ DON'T: Assume capabilities are available
await executeToolWithSchema(client, 'send_email', args);
```

### 5. Rate Limiting

```typescript
// ✅ DO: Implement and respect rate limits
class RateLimitedExecutor {
  private tokensPerMinute = 100;
  private tokens = this.tokensPerMinute;
  private lastRefill = Date.now();

  async executeWithRateLimit(fn: () => Promise<unknown>) {
    if (!this.hasTokens()) {
      await this.waitForTokens();
    }
    this.consumeToken();
    return fn();
  }

  private hasTokens(): boolean {
    this.refillTokens();
    return this.tokens > 0;
  }

  private refillTokens(): void {
    const now = Date.now();
    const secondsElapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.tokensPerMinute,
      this.tokens + (secondsElapsed * this.tokensPerMinute / 60)
    );
    this.lastRefill = now;
  }

  private consumeToken(): void {
    this.tokens--;
  }
}

// ❌ DON'T: Make unlimited parallel requests
for (const request of requests) {
  promises.push(executeToolWithSchema(client, request.tool, request.args));
}
await Promise.all(promises); // Could overwhelm server
```

### 6. Logging & Monitoring

```typescript
// ✅ DO: Comprehensive logging for debugging
interface ToolExecutionLog {
  timestamp: number;
  userId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  duration: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
}

class ExecutionLogger {
  async logExecution(
    log: ToolExecutionLog
  ): Promise<void> {
    // Send to logging service
    await this.loggingService.log({
      level: log.success ? 'info' : 'error',
      message: `Tool execution: ${log.toolName}`,
      context: log
    });
  }
}

// ❌ DON'T: Lose execution history
await executeToolWithSchema(client, toolName, args); // No logging
```

---

## Production Deployment

### Containerized Deployment Example

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY dist ./dist
COPY config ./config

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run application
CMD ["node", "dist/server.js"]

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
```

### Configuration Management

```typescript
interface MCPConfig {
  servers: Array<{
    name: string;
    url: string;
    transport: 'stdio' | 'http';
    auth?: {
      type: 'oauth' | 'bearer' | 'api-key';
      token?: string;
      tokenEndpoint?: string;
    };
    timeoutMs: number;
    retryAttempts: number;
    rateLimit: {
      callsPerMinute: number;
      costPerHour: number;
    };
  }>;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    service: string;
  };
  security: {
    enableRBAC: boolean;
    validateCertificates: boolean;
  };
}

// Load from environment
function loadConfig(): MCPConfig {
  return {
    servers: JSON.parse(process.env.MCP_SERVERS || '[]'),
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as any,
      service: process.env.LOGGING_SERVICE || 'local'
    },
    security: {
      enableRBAC: process.env.ENABLE_RBAC === 'true',
      validateCertificates: process.env.VALIDATE_CERTS !== 'false'
    }
  };
}
```

### Monitoring & Observability

```typescript
interface MCPMetrics {
  toolExecutionCount: number;
  toolExecutionTime: number;
  toolExecutionErrors: number;
  connectionUptime: number;
  rateLimitHits: number;
}

class MCPMetricsCollector {
  private metrics: MCPMetrics = {
    toolExecutionCount: 0,
    toolExecutionTime: 0,
    toolExecutionErrors: 0,
    connectionUptime: 0,
    rateLimitHits: 0
  };

  recordToolExecution(
    duration: number,
    success: boolean
  ): void {
    this.metrics.toolExecutionCount++;
    this.metrics.toolExecutionTime += duration;
    if (!success) {
      this.metrics.toolExecutionErrors++;
    }
  }

  recordRateLimitHit(): void {
    this.metrics.rateLimitHits++;
  }

  getMetrics(): MCPMetrics {
    return { ...this.metrics };
  }

  async exportMetrics(exporter: MetricsExporter): Promise<void> {
    await exporter.export(this.getMetrics());
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Objectives:**
- [ ] Set up TypeScript SDK integration
- [ ] Implement basic HTTP client transport
- [ ] Create connection management layer
- [ ] Build tool discovery mechanism

**Deliverables:**
- MCP client wrapper class
- Connection pool implementation
- Basic error handling
- Unit tests (80%+ coverage)

### Phase 2: Integration (Weeks 4-6)

**Objectives:**
- [ ] Integrate with OneMind's AI engine
- [ ] Implement tool execution pipeline
- [ ] Add capability discovery UI
- [ ] Create prompt templates

**Deliverables:**
- Tool execution adapter
- Capability registry
- Prompt template system
- Integration tests

### Phase 3: Security (Weeks 7-9)

**Objectives:**
- [ ] Implement OAuth 2.0 + PKCE
- [ ] Add RBAC enforcement
- [ ] Create audit logging
- [ ] Security testing

**Deliverables:**
- OAuth manager
- RBAC policy engine
- Audit log system
- Security audit report

### Phase 4: Production (Weeks 10-12)

**Objectives:**
- [ ] Performance optimization
- [ ] Monitoring & observability
- [ ] Docker containerization
- [ ] Production testing

**Deliverables:**
- Performance benchmarks
- Monitoring dashboards
- Deployment documentation
- Production runbook

### Phase 5: Advanced Features (Weeks 13+)

**Objectives:**
- [ ] Resource caching
- [ ] Batch request optimization
- [ ] Dynamic server discovery
- [ ] Advanced analytics

**Deliverables:**
- Caching layer
- Batch processor
- Server registry
- Analytics dashboard

---

## Quick Reference: Key Patterns

### Connection Initialization
```typescript
const client = await MCPClientFactory.create({
  serverUrl: 'https://mcp-server.example.com/mcp',
  authToken: await oauth.getToken(),
  timeout: 30000
});
```

### Tool Discovery & Execution
```typescript
const tools = await client.discoverTools();
const result = await client.executeTool('send_email', {
  recipient: 'user@example.com',
  subject: 'Hello',
  body: 'Test message'
});
```

### Resource Access
```typescript
const content = await client.readResource('file://docs/README.md');
const resources = await client.listResources();
```

### Error Recovery
```typescript
const result = await errorHandler.executeWithRetry(
  () => client.executeTool('risky_tool', args),
  'risky_operation',
  3 // max retries
);
```

---

## Conclusion

The Model Context Protocol provides a robust, standardized foundation for integrating external tools and data into AI applications. For OneMind, implementing comprehensive MCP support will:

1. **Enable Power-User Workflows:** Dynamic tool discovery and execution
2. **Improve Reliability:** Standardized error handling and resilience patterns
3. **Enhance Security:** OAuth 2.0, RBAC, and audit trails by design
4. **Scale Efficiently:** Connection pooling and batch optimization
5. **Future-Proof:** Leverage growing MCP server ecosystem

Following the patterns and best practices outlined in this report will ensure a production-grade implementation that scales with your user base and supports the sophisticated use cases your power users expect.

---

**Document Version:** 1.0  
**Last Updated:** February 15, 2026  
**Next Review:** May 15, 2026