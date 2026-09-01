"use client";

// src/provider.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  cleanupPolyfill,
  experimental_createJourneyRegistry,
  installPolyfill,
  isNativeModelContext,
  registerWebMCPElements,
  setJourneyRegistry
} from "@thegreataxios/webmcp-core";
import { jsx } from "react/jsx-runtime";
var defaultJourneyRegistry = experimental_createJourneyRegistry();
var WebMCPContext = createContext({
  available: false,
  native: false,
  journeyRegistry: defaultJourneyRegistry
});
function WebMCPProvider({ name, version, children }) {
  const journeyRegistry = useMemo(() => experimental_createJourneyRegistry(), []);
  const [available, setAvailable] = useState(false);
  useLayoutEffect(() => {
    registerWebMCPElements();
    installPolyfill();
    setJourneyRegistry(journeyRegistry);
    setAvailable(typeof document !== "undefined" && document.modelContext != null);
  }, [journeyRegistry]);
  useEffect(() => {
    return () => {
      setJourneyRegistry(null);
      cleanupPolyfill();
    };
  }, []);
  const value = useMemo(
    () => ({
      available,
      native: isNativeModelContext(),
      appName: name,
      appVersion: version,
      journeyRegistry
    }),
    [available, name, version, journeyRegistry]
  );
  return /* @__PURE__ */ jsx("div", { "data-webmcp-provider": true, "data-name": name, "data-version": version ?? "", children: /* @__PURE__ */ jsx(WebMCPContext.Provider, { value, children }) });
}
function useWebMCP() {
  return useContext(WebMCPContext);
}
var TOOL_OWNERS = /* @__PURE__ */ new Map();
function WebMCPTool({
  name,
  description,
  title,
  inputSchema,
  annotations,
  exposedTo,
  handler
}) {
  const { available } = useWebMCP();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const schemaKey = useMemo(() => JSON.stringify({ inputSchema, annotations, title }), [
    inputSchema,
    annotations,
    title
  ]);
  const stableHandler = useCallback(async (args) => {
    return await handlerRef.current(args);
  }, []);
  useEffect(() => {
    if (!available || typeof document === "undefined" || !document.modelContext) return;
    const owner = Symbol(name);
    const isOwner = !TOOL_OWNERS.has(name);
    if (isOwner) {
      TOOL_OWNERS.set(name, owner);
    }
    const controller = new AbortController();
    const descriptor = {
      name,
      title,
      description,
      inputSchema,
      annotations,
      execute: stableHandler
    };
    if (isOwner) {
      document.modelContext.registerTool(descriptor, { signal: controller.signal, exposedTo }).catch(() => {
      });
    }
    return () => {
      if (TOOL_OWNERS.get(name) !== owner) return;
      TOOL_OWNERS.delete(name);
      controller.abort();
    };
  }, [available, name, description, schemaKey, exposedTo, stableHandler]);
  return null;
}

// src/experimental/sync.tsx
import {
  useCallback as useCallback2,
  useRef as useRef2,
  useState as useState2
} from "react";
import { Fragment, jsx as jsx2 } from "react/jsx-runtime";
function experimental_useWebMCPSync(options) {
  const [state, setReactState] = useState2(options.initial);
  const stateRef = useRef2(state);
  const optionsRef = useRef2(options);
  optionsRef.current = options;
  const mutationQueueRef = useRef2(Promise.resolve());
  const setState = useCallback2((action) => {
    const next = typeof action === "function" ? action(stateRef.current) : action;
    stateRef.current = next;
    setReactState(next);
  }, []);
  const Tools = /* @__PURE__ */ jsx2(Fragment, { children: Object.entries(options.tools).map(([name, tool]) => {
    const metadata = typeof tool === "function" ? null : tool;
    const reducer = typeof tool === "function" ? tool : tool.reducer;
    return /* @__PURE__ */ jsx2(
      WebMCPTool,
      {
        name,
        title: metadata?.title,
        description: metadata?.description ?? `State-synced: ${name}`,
        inputSchema: metadata?.inputSchema,
        annotations: metadata?.annotations,
        handler: (args) => {
          const run = mutationQueueRef.current.then(async () => {
            try {
              const previous = stateRef.current;
              const next = await reducer(previous, args);
              setState(next);
              optionsRef.current.onMutation?.({ tool: name, args, previous, next });
              return {
                content: [{ type: "text", text: JSON.stringify(next) }],
                structuredContent: next
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: error instanceof Error ? error.message : "State mutation failed"
                  }
                ],
                isError: true
              };
            }
          });
          mutationQueueRef.current = run.then(
            () => void 0,
            () => void 0
          );
          return run;
        }
      },
      name
    );
  }) });
  return { state, setState, Tools };
}

// src/experimental/journey.tsx
import { useEffect as useEffect2, useReducer } from "react";
import { jsx as jsx3 } from "react/jsx-runtime";
function experimental_WebMCPJourney({
  name,
  description,
  tools,
  steps,
  when = true,
  children
}) {
  const { journeyRegistry } = useWebMCP();
  const toolsKey = JSON.stringify(tools);
  const stepsKey = JSON.stringify(steps);
  useEffect2(() => {
    const def = {
      name,
      description,
      tools: [...tools],
      steps: steps ? [...steps] : void 0
    };
    journeyRegistry.register(def);
    return () => journeyRegistry.unregister(name);
  }, [journeyRegistry, name, description, toolsKey, stepsKey]);
  useEffect2(() => {
    journeyRegistry.setJourneyActive(name, when);
    return () => journeyRegistry.setJourneyActive(name, false);
  }, [journeyRegistry, name, when, toolsKey, stepsKey]);
  if (!when) return null;
  return /* @__PURE__ */ jsx3("webmcp-journey", { name, "data-description": description ?? "", children });
}
function experimental_useWebMCPJourney() {
  const { journeyRegistry } = useWebMCP();
  const [, refresh] = useReducer((version) => version + 1, 0);
  useEffect2(() => journeyRegistry.addChangeListener(refresh), [journeyRegistry]);
  return {
    activeJourneys: journeyRegistry.getActiveJourneys().map((j) => j.name),
    isToolExposed: (toolName) => journeyRegistry.isToolExposed(toolName)
  };
}

// src/experimental/confirm.tsx
import {
  createContext as createContext2,
  useCallback as useCallback3,
  useContext as useContext2,
  useEffect as useEffect3,
  useRef as useRef3,
  useState as useState3
} from "react";
import { jsx as jsx4 } from "react/jsx-runtime";
var ConfirmContext = createContext2(null);
function experimental_WebMCPConfirmProvider({ children }) {
  const [pending, setPending] = useState3(null);
  const queueRef = useRef3([]);
  const mountedRef = useRef3(true);
  const showNextRef = useRef3(() => {
  });
  showNextRef.current = () => {
    const next = queueRef.current[0];
    if (!next || !mountedRef.current) {
      setPending(null);
      return;
    }
    const settle = (approved) => {
      if (queueRef.current[0] !== next) return;
      queueRef.current.shift();
      next.resolve(approved);
      if (mountedRef.current) {
        setPending(null);
        queueMicrotask(() => showNextRef.current());
      }
    };
    setPending({
      tool: next.tool,
      args: next.args,
      approve: () => settle(true),
      reject: () => settle(false)
    });
  };
  const request = useCallback3((tool, args) => {
    return new Promise((resolve) => {
      if (!mountedRef.current) {
        resolve(false);
        return;
      }
      queueRef.current.push({ tool, args, resolve });
      if (queueRef.current.length === 1) showNextRef.current();
    });
  }, []);
  useEffect3(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const queued of queueRef.current.splice(0)) queued.resolve(false);
    };
  }, []);
  return /* @__PURE__ */ jsx4(ConfirmContext.Provider, { value: { pending, request }, children });
}
function experimental_useWebMCPConfirm() {
  const ctx = useContext2(ConfirmContext);
  return {
    pending: ctx?.pending ?? null,
    requestConfirmation: ctx?.request
  };
}
function experimental_WebMCPGuardedTool({
  name,
  description,
  inputSchema,
  requiresConfirm = true,
  handler
}) {
  const { requestConfirmation } = experimental_useWebMCPConfirm();
  return /* @__PURE__ */ jsx4(
    WebMCPTool,
    {
      name,
      description,
      inputSchema,
      handler: async (args) => {
        if (requiresConfirm && !requestConfirmation) {
          return {
            content: [{ type: "text", text: "Confirmation provider unavailable" }],
            isError: true
          };
        }
        if (requiresConfirm) {
          const approved = await requestConfirmation(name, args);
          if (!approved) {
            return {
              content: [{ type: "text", text: "User declined" }],
              isError: true
            };
          }
        }
        return await handler(args);
      }
    }
  );
}

// src/experimental/bridge.tsx
import { createContext as createContext3, useContext as useContext3, useEffect as useEffect4, useState as useState4 } from "react";
import { createPageBridgeClient } from "@thegreataxios/webmcp-core";
import { jsx as jsx5 } from "react/jsx-runtime";
var BridgeContext = createContext3("disconnected");
function experimental_WebMCPBridgeProvider({
  token,
  url,
  children
}) {
  const [status, setStatus] = useState4("disconnected");
  useEffect4(() => {
    const wsUrl = url ?? "ws://127.0.0.1:17321/ws";
    const client = createPageBridgeClient({
      url: wsUrl,
      token,
      onStatusChange: setStatus
    });
    client.connect();
    return () => client.disconnect();
  }, [token, url]);
  return /* @__PURE__ */ jsx5(BridgeContext.Provider, { value: status, children });
}
function experimental_useWebMCPBridgeStatus() {
  return useContext3(BridgeContext);
}

// src/index.ts
var ExperimentalWebMCPJourney = experimental_WebMCPJourney;
var ExperimentalWebMCPConfirmProvider = experimental_WebMCPConfirmProvider;
var ExperimentalWebMCPGuardedTool = experimental_WebMCPGuardedTool;
var ExperimentalWebMCPBridgeProvider = experimental_WebMCPBridgeProvider;
export {
  ExperimentalWebMCPBridgeProvider,
  ExperimentalWebMCPConfirmProvider,
  ExperimentalWebMCPGuardedTool,
  ExperimentalWebMCPJourney,
  WebMCPProvider,
  WebMCPTool,
  experimental_WebMCPBridgeProvider,
  experimental_WebMCPConfirmProvider,
  experimental_WebMCPGuardedTool,
  experimental_WebMCPJourney,
  experimental_useWebMCPBridgeStatus,
  experimental_useWebMCPConfirm,
  experimental_useWebMCPJourney,
  experimental_useWebMCPSync,
  useWebMCP
};
//# sourceMappingURL=index.js.map