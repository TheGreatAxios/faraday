"use client";
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ExperimentalWebMCPBridgeProvider: () => ExperimentalWebMCPBridgeProvider,
  ExperimentalWebMCPConfirmProvider: () => ExperimentalWebMCPConfirmProvider,
  ExperimentalWebMCPGuardedTool: () => ExperimentalWebMCPGuardedTool,
  ExperimentalWebMCPJourney: () => ExperimentalWebMCPJourney,
  WebMCPProvider: () => WebMCPProvider,
  WebMCPTool: () => WebMCPTool,
  experimental_WebMCPBridgeProvider: () => experimental_WebMCPBridgeProvider,
  experimental_WebMCPConfirmProvider: () => experimental_WebMCPConfirmProvider,
  experimental_WebMCPGuardedTool: () => experimental_WebMCPGuardedTool,
  experimental_WebMCPJourney: () => experimental_WebMCPJourney,
  experimental_useWebMCPBridgeStatus: () => experimental_useWebMCPBridgeStatus,
  experimental_useWebMCPConfirm: () => experimental_useWebMCPConfirm,
  experimental_useWebMCPJourney: () => experimental_useWebMCPJourney,
  experimental_useWebMCPSync: () => experimental_useWebMCPSync,
  useWebMCP: () => useWebMCP
});
module.exports = __toCommonJS(index_exports);

// src/provider.tsx
var import_react = require("react");
var import_webmcp_core = require("@thegreataxios/webmcp-core");
var import_jsx_runtime = require("react/jsx-runtime");
var defaultJourneyRegistry = (0, import_webmcp_core.experimental_createJourneyRegistry)();
var WebMCPContext = (0, import_react.createContext)({
  available: false,
  native: false,
  journeyRegistry: defaultJourneyRegistry
});
function WebMCPProvider({ name, version, children }) {
  const journeyRegistry = (0, import_react.useMemo)(() => (0, import_webmcp_core.experimental_createJourneyRegistry)(), []);
  const [available, setAvailable] = (0, import_react.useState)(false);
  (0, import_react.useLayoutEffect)(() => {
    (0, import_webmcp_core.registerWebMCPElements)();
    (0, import_webmcp_core.installPolyfill)();
    (0, import_webmcp_core.setJourneyRegistry)(journeyRegistry);
    setAvailable(typeof document !== "undefined" && document.modelContext != null);
  }, [journeyRegistry]);
  (0, import_react.useEffect)(() => {
    return () => {
      (0, import_webmcp_core.setJourneyRegistry)(null);
      (0, import_webmcp_core.cleanupPolyfill)();
    };
  }, []);
  const value = (0, import_react.useMemo)(
    () => ({
      available,
      native: (0, import_webmcp_core.isNativeModelContext)(),
      appName: name,
      appVersion: version,
      journeyRegistry
    }),
    [available, name, version, journeyRegistry]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-webmcp-provider": true, "data-name": name, "data-version": version ?? "", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WebMCPContext.Provider, { value, children }) });
}
function useWebMCP() {
  return (0, import_react.useContext)(WebMCPContext);
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
  const handlerRef = (0, import_react.useRef)(handler);
  handlerRef.current = handler;
  const schemaKey = (0, import_react.useMemo)(() => JSON.stringify({ inputSchema, annotations, title }), [
    inputSchema,
    annotations,
    title
  ]);
  const stableHandler = (0, import_react.useCallback)(async (args) => {
    return await handlerRef.current(args);
  }, []);
  (0, import_react.useEffect)(() => {
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
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function experimental_useWebMCPSync(options) {
  const [state, setReactState] = (0, import_react2.useState)(options.initial);
  const stateRef = (0, import_react2.useRef)(state);
  const optionsRef = (0, import_react2.useRef)(options);
  optionsRef.current = options;
  const mutationQueueRef = (0, import_react2.useRef)(Promise.resolve());
  const setState = (0, import_react2.useCallback)((action) => {
    const next = typeof action === "function" ? action(stateRef.current) : action;
    stateRef.current = next;
    setReactState(next);
  }, []);
  const Tools = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: Object.entries(options.tools).map(([name, tool]) => {
    const metadata = typeof tool === "function" ? null : tool;
    const reducer = typeof tool === "function" ? tool : tool.reducer;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
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
  (0, import_react3.useEffect)(() => {
    const def = {
      name,
      description,
      tools: [...tools],
      steps: steps ? [...steps] : void 0
    };
    journeyRegistry.register(def);
    return () => journeyRegistry.unregister(name);
  }, [journeyRegistry, name, description, toolsKey, stepsKey]);
  (0, import_react3.useEffect)(() => {
    journeyRegistry.setJourneyActive(name, when);
    return () => journeyRegistry.setJourneyActive(name, false);
  }, [journeyRegistry, name, when, toolsKey, stepsKey]);
  if (!when) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("webmcp-journey", { name, "data-description": description ?? "", children });
}
function experimental_useWebMCPJourney() {
  const { journeyRegistry } = useWebMCP();
  const [, refresh] = (0, import_react3.useReducer)((version) => version + 1, 0);
  (0, import_react3.useEffect)(() => journeyRegistry.addChangeListener(refresh), [journeyRegistry]);
  return {
    activeJourneys: journeyRegistry.getActiveJourneys().map((j) => j.name),
    isToolExposed: (toolName) => journeyRegistry.isToolExposed(toolName)
  };
}

// src/experimental/confirm.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var ConfirmContext = (0, import_react4.createContext)(null);
function experimental_WebMCPConfirmProvider({ children }) {
  const [pending, setPending] = (0, import_react4.useState)(null);
  const queueRef = (0, import_react4.useRef)([]);
  const mountedRef = (0, import_react4.useRef)(true);
  const showNextRef = (0, import_react4.useRef)(() => {
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
  const request = (0, import_react4.useCallback)((tool, args) => {
    return new Promise((resolve) => {
      if (!mountedRef.current) {
        resolve(false);
        return;
      }
      queueRef.current.push({ tool, args, resolve });
      if (queueRef.current.length === 1) showNextRef.current();
    });
  }, []);
  (0, import_react4.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const queued of queueRef.current.splice(0)) queued.resolve(false);
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ConfirmContext.Provider, { value: { pending, request }, children });
}
function experimental_useWebMCPConfirm() {
  const ctx = (0, import_react4.useContext)(ConfirmContext);
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
var import_react5 = require("react");
var import_webmcp_core2 = require("@thegreataxios/webmcp-core");
var import_jsx_runtime5 = require("react/jsx-runtime");
var BridgeContext = (0, import_react5.createContext)("disconnected");
function experimental_WebMCPBridgeProvider({
  token,
  url,
  children
}) {
  const [status, setStatus] = (0, import_react5.useState)("disconnected");
  (0, import_react5.useEffect)(() => {
    const wsUrl = url ?? "ws://127.0.0.1:17321/ws";
    const client = (0, import_webmcp_core2.createPageBridgeClient)({
      url: wsUrl,
      token,
      onStatusChange: setStatus
    });
    client.connect();
    return () => client.disconnect();
  }, [token, url]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(BridgeContext.Provider, { value: status, children });
}
function experimental_useWebMCPBridgeStatus() {
  return (0, import_react5.useContext)(BridgeContext);
}

// src/index.ts
var ExperimentalWebMCPJourney = experimental_WebMCPJourney;
var ExperimentalWebMCPConfirmProvider = experimental_WebMCPConfirmProvider;
var ExperimentalWebMCPGuardedTool = experimental_WebMCPGuardedTool;
var ExperimentalWebMCPBridgeProvider = experimental_WebMCPBridgeProvider;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
//# sourceMappingURL=index.cjs.map