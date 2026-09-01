/**
 * Types aligned with W3C WebMCP tool vocabulary.
 * @see https://github.com/webmachinelearning/webmcp
 */
type JsonSchema = Record<string, unknown>;
interface ToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
}
interface ContentBlock {
    type: "text" | "image";
    text?: string;
    data?: string;
    mimeType?: string;
}
interface CallToolResult {
    content: ContentBlock[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}
type ToolExecuteCallback = (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
interface ToolDescriptor {
    name: string;
    title?: string;
    description: string;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
    execute: ToolExecuteCallback;
}
interface RegisterToolOptions {
    signal?: AbortSignal;
    exposedTo?: string[];
}
interface RegisteredTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
}
interface ModelContextTesting {
    listTools(): Array<{
        name: string;
        description: string;
        inputSchema?: string;
    }>;
    executeTool(toolName: string, inputArgsJson: string, options?: {
        signal?: AbortSignal;
    }): Promise<string | null>;
    registerToolsChangedCallback(callback: () => void): void;
    getCrossDocumentScriptToolResult(): Promise<string>;
}
interface JourneyDefinition {
    name: string;
    description?: string;
    tools: string[];
    steps?: string[];
}
interface JourneyRegistry {
    register(definition: JourneyDefinition): void;
    unregister(name: string): void;
    getActiveJourneys(): JourneyDefinition[];
    isToolExposed(toolName: string): boolean;
    setJourneyActive(name: string, active: boolean): void;
    addChangeListener(listener: () => void): () => void;
}
/** Wire protocol between page and @thegreataxios/webmcp-bridge */
type BridgeClientMessage = {
    type: "auth";
    token: string;
} | {
    type: "sync_tools";
    tools: BridgeToolSummary[];
} | {
    type: "tool_result";
    id: string;
    result: CallToolResult | {
        error: string;
    };
};
type BridgeServerMessage = {
    type: "auth_required";
} | {
    type: "auth_ok";
} | {
    type: "error";
    message: string;
} | {
    type: "execute_tool";
    id: string;
    name: string;
    args: Record<string, unknown>;
};
interface BridgeToolSummary {
    name: string;
    description: string;
    inputSchema?: JsonSchema;
    title?: string;
    annotations?: ToolAnnotations;
}

interface ModelContext extends EventTarget {
  registerTool(
    tool: ToolDescriptor,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<undefined>;
  ontoolchange?: () => void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContextTesting?: ModelContextTesting;
  }
}

type ChangeListener = () => void;
interface ToolRegistry {
    register(descriptor: ToolDescriptor, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
    unregister(name: string): void;
    getTool(name: string): ToolDescriptor | undefined;
    listTools(): RegisteredTool[];
    addChangeListener(listener: ChangeListener): () => void;
}
declare function createToolRegistry(): ToolRegistry;

declare function setJourneyRegistry(registry: JourneyRegistry | null): void;
declare function getJourneyRegistry(): JourneyRegistry | null;
declare function isNativeModelContext(): boolean;
declare function installPolyfill(): boolean;
declare function cleanupPolyfill(): void;
declare function getRegistry(): ToolRegistry | null;
declare function listBridgeToolSummaries(): BridgeToolSummary[];
declare function executeToolForBridge(name: string, args: Record<string, unknown>): Promise<unknown>;

interface PageBridgeClientOptions {
    url: string;
    token: string;
    onStatusChange?: (status: PageBridgeStatus) => void;
}
type PageBridgeStatus = "disconnected" | "connecting" | "connected" | "error";
/**
 * Connects the current page to a local webmcp-bridge WebSocket server.
 * Syncs exposed tools and executes tool calls from the bridge.
 */
declare function createPageBridgeClient(options: PageBridgeClientOptions): {
    connect: () => void;
    disconnect: () => void;
    getStatus: () => PageBridgeStatus;
};

type ProviderElement = HTMLElement;
type JourneyElement = HTMLElement;
declare function registerWebMCPElements(): void;
declare function WebMCPProviderElement(): ProviderElement;
declare function WebMCPJourneyElement(): JourneyElement;
declare const WEBMCP_TAGS: {
    PROVIDER: string;
    JOURNEY: string;
};

declare function experimental_createJourneyRegistry(): JourneyRegistry;
declare function experimental_defineJourney(registry: JourneyRegistry, definition: JourneyDefinition): void;

declare function assertToolName(name: string): void;
declare function validateToolDescriptor(descriptor: ToolDescriptor): void;
declare function parseToolArgsJson(inputArgsJson: string): Record<string, unknown>;

export { type BridgeClientMessage, type BridgeServerMessage, type BridgeToolSummary, type CallToolResult, type ContentBlock, type JourneyDefinition, type JourneyRegistry, type JsonSchema, type ModelContext, type ModelContextTesting, type PageBridgeClientOptions, type PageBridgeStatus, type RegisterToolOptions, type RegisteredTool, type ToolAnnotations, type ToolDescriptor, type ToolExecuteCallback, type ToolRegistry, WEBMCP_TAGS, WebMCPJourneyElement, WebMCPProviderElement, assertToolName, cleanupPolyfill, createPageBridgeClient, createToolRegistry, executeToolForBridge, experimental_createJourneyRegistry, experimental_defineJourney, getJourneyRegistry, getRegistry, installPolyfill, isNativeModelContext, listBridgeToolSummaries, parseToolArgsJson, registerWebMCPElements, setJourneyRegistry, validateToolDescriptor };
