import * as react from 'react';
import { ReactNode, Dispatch, SetStateAction } from 'react';
import { JourneyRegistry, JsonSchema, ToolAnnotations, CallToolResult, PageBridgeStatus } from '@thegreataxios/webmcp-core';

interface WebMCPContextValue {
    available: boolean;
    native: boolean;
    appName?: string;
    appVersion?: string;
    journeyRegistry: JourneyRegistry;
}
interface WebMCPProviderProps {
    name: string;
    version?: string;
    children: ReactNode;
}
declare function WebMCPProvider({ name, version, children }: WebMCPProviderProps): react.JSX.Element;
declare function useWebMCP(): WebMCPContextValue;
interface WebMCPToolProps {
    name: string;
    description: string;
    title?: string;
    inputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
    exposedTo?: string[];
    handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
}
declare function WebMCPTool({ name, description, title, inputSchema, annotations, exposedTo, handler, }: WebMCPToolProps): null;

type WebMCPSyncReducer<T> = (state: T, args: Record<string, unknown>) => T | Promise<T>;
type WebMCPSyncTool<T> = WebMCPSyncReducer<T> | {
    reducer: WebMCPSyncReducer<T>;
    description: string;
    title?: string;
    inputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
};
interface WebMCPSyncOptions<T> {
    initial: T;
    tools: Record<string, WebMCPSyncTool<T>>;
    onMutation?: (info: {
        tool: string;
        args: Record<string, unknown>;
        previous: T;
        next: T;
    }) => void;
}
interface WebMCPSyncResult<T> {
    state: T;
    setState: Dispatch<SetStateAction<T>>;
    Tools: ReactNode;
}
/** experimental — agent tool calls update React state automatically */
declare function experimental_useWebMCPSync<T>(options: WebMCPSyncOptions<T>): WebMCPSyncResult<T>;

interface ExperimentalWebMCPJourneyProps {
    name: string;
    description?: string;
    tools: readonly string[];
    steps?: readonly string[];
    when?: boolean;
    children?: ReactNode;
}
/** experimental — phase-scoped tool exposure (W3C #161) */
declare function experimental_WebMCPJourney({ name, description, tools, steps, when, children, }: ExperimentalWebMCPJourneyProps): react.JSX.Element | null;
declare function experimental_useWebMCPJourney(): {
    activeJourneys: string[];
    isToolExposed: (toolName: string) => boolean;
};

interface PendingConfirmation {
    tool: string;
    args: Record<string, unknown>;
    approve: () => void;
    reject: (reason?: string) => void;
}
declare function experimental_WebMCPConfirmProvider({ children }: {
    children: ReactNode;
}): react.JSX.Element;
declare function experimental_useWebMCPConfirm(): {
    pending: PendingConfirmation | null;
    requestConfirmation: ((tool: string, args: Record<string, unknown>) => Promise<boolean>) | undefined;
};
interface GuardedToolProps {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    requiresConfirm?: boolean;
    handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
}
/** experimental — wraps WebMCPTool with optional confirmation gate */
declare function experimental_WebMCPGuardedTool({ name, description, inputSchema, requiresConfirm, handler, }: GuardedToolProps): react.JSX.Element;

interface ExperimentalWebMCPBridgeProviderProps {
    token: string;
    url?: string;
    children: ReactNode;
}
/** experimental — maintains WebSocket connection to webmcp-bridge */
declare function experimental_WebMCPBridgeProvider({ token, url, children, }: ExperimentalWebMCPBridgeProviderProps): react.JSX.Element;
declare function experimental_useWebMCPBridgeStatus(): PageBridgeStatus;

/**
 * PascalCase aliases for JSX.
 *
 * React treats lowercase-initial tags as HTML intrinsics, so
 * `<experimental_WebMCPJourney />` is invalid. Prefer these in JSX.
 */
declare const ExperimentalWebMCPJourney: typeof experimental_WebMCPJourney;
declare const ExperimentalWebMCPConfirmProvider: typeof experimental_WebMCPConfirmProvider;
declare const ExperimentalWebMCPGuardedTool: typeof experimental_WebMCPGuardedTool;
declare const ExperimentalWebMCPBridgeProvider: typeof experimental_WebMCPBridgeProvider;

export { ExperimentalWebMCPBridgeProvider, type ExperimentalWebMCPBridgeProviderProps, ExperimentalWebMCPConfirmProvider, ExperimentalWebMCPGuardedTool, ExperimentalWebMCPJourney, type ExperimentalWebMCPJourneyProps, type GuardedToolProps, type PendingConfirmation, type WebMCPContextValue, WebMCPProvider, type WebMCPProviderProps, type WebMCPSyncOptions, type WebMCPSyncResult, type WebMCPSyncTool, WebMCPTool, type WebMCPToolProps, experimental_WebMCPBridgeProvider, experimental_WebMCPConfirmProvider, experimental_WebMCPGuardedTool, experimental_WebMCPJourney, experimental_useWebMCPBridgeStatus, experimental_useWebMCPConfirm, experimental_useWebMCPJourney, experimental_useWebMCPSync, useWebMCP };
