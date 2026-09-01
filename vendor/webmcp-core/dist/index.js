// src/validation.ts
var TOOL_NAME_RE = /^[A-Za-z0-9_.-]+$/;
var MAX_NAME_LEN = 128;
function assertToolName(name) {
  if (!name || name.length > MAX_NAME_LEN || !TOOL_NAME_RE.test(name)) {
    throw new DOMException(
      `Invalid tool name "${name}". Must be 1\u2013128 chars matching ${TOOL_NAME_RE.source}`,
      "SyntaxError"
    );
  }
}
function assertToolDescription(description) {
  if (!description || description.trim().length === 0) {
    throw new DOMException("Tool description is required", "SyntaxError");
  }
}
function assertSerializableJson(value, label) {
  try {
    JSON.stringify(value);
  } catch {
    throw new DOMException(`${label} must be JSON-serializable`, "SyntaxError");
  }
}
function assertInputSchema(schema) {
  if (schema !== void 0) {
    assertSerializableJson(schema, "inputSchema");
  }
}
function validateToolDescriptor(descriptor) {
  if (typeof descriptor.execute !== "function") {
    throw new TypeError("Tool execute must be a function");
  }
  assertToolName(descriptor.name);
  assertToolDescription(descriptor.description);
  assertInputSchema(descriptor.inputSchema);
  if (descriptor.outputSchema !== void 0) {
    assertSerializableJson(descriptor.outputSchema, "outputSchema");
  }
  if (descriptor.annotations !== void 0) {
    assertSerializableJson(descriptor.annotations, "annotations");
  }
}
function parseToolArgsJson(inputArgsJson) {
  let parsed;
  try {
    parsed = JSON.parse(inputArgsJson);
  } catch {
    throw new DOMException("Invalid JSON input", "OperationError");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DOMException("Input must be a JSON object", "OperationError");
  }
  return parsed;
}

// src/registry.ts
function createToolRegistry() {
  const tools = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const abortCleanups = /* @__PURE__ */ new Map();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    async register(descriptor, options) {
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      validateToolDescriptor(descriptor);
      if (tools.has(descriptor.name)) {
        throw new DOMException(
          `Tool "${descriptor.name}" is already registered`,
          "InvalidStateError"
        );
      }
      tools.set(descriptor.name, descriptor);
      if (options?.signal) {
        const signal = options.signal;
        const onAbort = () => {
          tools.delete(descriptor.name);
          abortCleanups.delete(descriptor.name);
          notify();
        };
        signal.addEventListener("abort", onAbort, { once: true });
        abortCleanups.set(descriptor.name, () => signal.removeEventListener("abort", onAbort));
      }
      notify();
    },
    unregister(name) {
      const cleanup = abortCleanups.get(name);
      if (cleanup) {
        cleanup();
        abortCleanups.delete(name);
      }
      if (tools.delete(name)) {
        notify();
      }
    },
    getTool(name) {
      return tools.get(name);
    },
    listTools() {
      return Array.from(tools.values()).map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations
      }));
    },
    addChangeListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// src/polyfill.ts
var POLYFILL_MARKER = "__isWebMCPPolyfill";
var polyfillCount = 0;
var installedRegistry = null;
var journeyRegistry = null;
function setJourneyRegistry(registry) {
  journeyRegistry = registry;
}
function getJourneyRegistry() {
  return journeyRegistry;
}
function filterExposedTools(registry) {
  return registry.listTools().filter((tool) => {
    if (!journeyRegistry) return true;
    return journeyRegistry.isToolExposed(tool.name);
  });
}
function createModelContext(registry) {
  const target = new EventTarget();
  target[POLYFILL_MARKER] = true;
  let changeScheduled = false;
  const scheduleToolChange = () => {
    if (changeScheduled) return;
    changeScheduled = true;
    queueMicrotask(() => {
      changeScheduled = false;
      target.dispatchEvent(new Event("toolchange"));
    });
  };
  registry.addChangeListener(scheduleToolChange);
  if (journeyRegistry) {
    journeyRegistry.addChangeListener(scheduleToolChange);
  }
  const modelContext = Object.assign(target, {
    async registerTool(tool, options) {
      await registry.register(tool, options);
      scheduleToolChange();
      return void 0;
    }
  });
  return modelContext;
}
function createTestingShim(registry) {
  let offChange = null;
  return {
    listTools() {
      return filterExposedTools(registry).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema ? JSON.stringify(t.inputSchema) : void 0
      }));
    },
    async executeTool(toolName, inputArgsJson, options) {
      if (journeyRegistry && !journeyRegistry.isToolExposed(toolName)) {
        throw new DOMException(`Tool "${toolName}" is not exposed in the active journey`, "NotFoundError");
      }
      const tool = registry.getTool(toolName);
      if (!tool) {
        throw new DOMException(`Tool "${toolName}" not found`, "NotFoundError");
      }
      if (options?.signal?.aborted) {
        throw new DOMException("Tool execution was aborted", "AbortError");
      }
      const parsed = parseToolArgsJson(inputArgsJson);
      const result = await tool.execute(parsed);
      return JSON.stringify(result);
    },
    registerToolsChangedCallback(callback) {
      offChange?.();
      const offRegistry = registry.addChangeListener(callback);
      const offJourney = journeyRegistry?.addChangeListener(callback);
      offChange = () => {
        offRegistry();
        offJourney?.();
      };
    },
    getCrossDocumentScriptToolResult() {
      return Promise.resolve("[]");
    }
  };
}
function isNativeModelContext() {
  if (typeof document === "undefined") return false;
  const mc = document.modelContext;
  return mc != null && mc[POLYFILL_MARKER] !== true;
}
function installPolyfill() {
  if (typeof document === "undefined") return false;
  if (isNativeModelContext()) return false;
  polyfillCount++;
  if (polyfillCount > 1) return true;
  installedRegistry = createToolRegistry();
  const modelContext = createModelContext(installedRegistry);
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    enumerable: true,
    value: modelContext
  });
  Object.defineProperty(navigator, "modelContextTesting", {
    configurable: true,
    enumerable: true,
    value: createTestingShim(installedRegistry)
  });
  return true;
}
function cleanupPolyfill() {
  if (typeof document === "undefined") return;
  if (isNativeModelContext()) return;
  polyfillCount = Math.max(0, polyfillCount - 1);
  if (polyfillCount > 0) return;
  installedRegistry = null;
  Reflect.deleteProperty(document, "modelContext");
  Reflect.deleteProperty(navigator, "modelContextTesting");
}
function getRegistry() {
  return installedRegistry;
}
function listBridgeToolSummaries() {
  if (!installedRegistry) return [];
  return filterExposedTools(installedRegistry);
}
function executeToolForBridge(name, args) {
  const testing = navigator.modelContextTesting;
  if (!testing) {
    throw new Error("modelContextTesting is not available");
  }
  return testing.executeTool(name, JSON.stringify(args));
}

// src/bridge/page-client.ts
function createPageBridgeClient(options) {
  let ws = null;
  let status = "disconnected";
  let offToolsChange = null;
  const setStatus = (next) => {
    status = next;
    options.onStatusChange?.(next);
  };
  const syncTools = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const tools = listBridgeToolSummaries();
    const msg = { type: "sync_tools", tools };
    ws.send(JSON.stringify(msg));
  };
  const handleMessage = async (event) => {
    const data = JSON.parse(String(event.data));
    if (data.type === "auth_required") {
      ws?.send(JSON.stringify({ type: "auth", token: options.token }));
      return;
    }
    if (data.type === "auth_ok") {
      setStatus("connected");
      syncTools();
      return;
    }
    if (data.type === "error") {
      setStatus("error");
      return;
    }
    if (data.type === "execute_tool") {
      try {
        const raw = await executeToolForBridge(data.name, data.args);
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        ws?.send(
          JSON.stringify({
            type: "tool_result",
            id: data.id,
            result
          })
        );
      } catch (err) {
        ws?.send(
          JSON.stringify({
            type: "tool_result",
            id: data.id,
            result: { error: err instanceof Error ? err.message : String(err) }
          })
        );
      }
    }
  };
  return {
    connect() {
      if (ws) return;
      setStatus("connecting");
      ws = new WebSocket(options.url);
      ws.addEventListener("open", () => {
      });
      ws.addEventListener("message", (e) => {
        handleMessage(e).catch(() => setStatus("error"));
      });
      ws.addEventListener("close", () => {
        setStatus("disconnected");
        ws = null;
        offToolsChange?.();
        offToolsChange = null;
      });
      ws.addEventListener("error", () => setStatus("error"));
      if (typeof document !== "undefined" && document.modelContext) {
        const onToolChange = () => syncTools();
        document.modelContext.addEventListener("toolchange", onToolChange);
        offToolsChange = () => document.modelContext?.removeEventListener("toolchange", onToolChange);
      }
    },
    disconnect() {
      offToolsChange?.();
      offToolsChange = null;
      ws?.close();
      ws = null;
      setStatus("disconnected");
    },
    getStatus: () => status
  };
}

// src/elements.ts
var PROVIDER_TAG = "webmcp-provider";
var JOURNEY_TAG = "webmcp-journey";
var providerElementClass = null;
var journeyElementClass = null;
function ensureElementClasses() {
  if (typeof HTMLElement === "undefined") return;
  if (providerElementClass && journeyElementClass) return;
  providerElementClass = class WebMCPProviderElement extends HTMLElement {
    connectedCallback() {
      installPolyfill();
      this.dispatchEvent(new CustomEvent("webmcp-ready", { bubbles: true }));
    }
    disconnectedCallback() {
      cleanupPolyfill();
    }
  };
  journeyElementClass = class WebMCPJourneyElement extends HTMLElement {
    connectedCallback() {
      const name = this.getAttribute("name");
      if (!name) return;
      this.dispatchEvent(
        new CustomEvent("webmcp-journey-active", {
          detail: { name, active: true },
          bubbles: true
        })
      );
    }
    disconnectedCallback() {
      const name = this.getAttribute("name");
      if (!name) return;
      this.dispatchEvent(
        new CustomEvent("webmcp-journey-active", {
          detail: { name, active: false },
          bubbles: true
        })
      );
    }
  };
}
function registerWebMCPElements() {
  if (typeof customElements === "undefined") return;
  ensureElementClasses();
  if (!providerElementClass || !journeyElementClass) return;
  if (!customElements.get(PROVIDER_TAG)) {
    customElements.define(PROVIDER_TAG, providerElementClass);
  }
  if (!customElements.get(JOURNEY_TAG)) {
    customElements.define(JOURNEY_TAG, journeyElementClass);
  }
}
function WebMCPProviderElement() {
  ensureElementClasses();
  if (!providerElementClass) {
    throw new Error("HTMLElement is not available in this environment");
  }
  return new providerElementClass();
}
function WebMCPJourneyElement() {
  ensureElementClasses();
  if (!journeyElementClass) {
    throw new Error("HTMLElement is not available in this environment");
  }
  return new journeyElementClass();
}
var WEBMCP_TAGS = { PROVIDER: PROVIDER_TAG, JOURNEY: JOURNEY_TAG };

// src/experimental/journey.ts
function experimental_createJourneyRegistry() {
  const journeys = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Set();
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    register(definition) {
      journeys.set(definition.name, definition);
      notify();
    },
    unregister(name) {
      if (!journeys.has(name)) return;
      journeys.delete(name);
      active.delete(name);
      notify();
    },
    getActiveJourneys() {
      return Array.from(active).map((name) => journeys.get(name)).filter((j) => j != null);
    },
    isToolExposed(toolName) {
      if (active.size === 0) return true;
      for (const name of active) {
        const journey = journeys.get(name);
        if (journey?.tools.includes(toolName)) return true;
      }
      return false;
    },
    setJourneyActive(name, isActive) {
      if (!journeys.has(name)) return;
      const changed = isActive ? !active.has(name) : active.has(name);
      if (!changed) return;
      if (isActive) active.add(name);
      else active.delete(name);
      notify();
    },
    addChangeListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
function experimental_defineJourney(registry, definition) {
  registry.register(definition);
}
export {
  WEBMCP_TAGS,
  WebMCPJourneyElement,
  WebMCPProviderElement,
  assertToolName,
  cleanupPolyfill,
  createPageBridgeClient,
  createToolRegistry,
  executeToolForBridge,
  experimental_createJourneyRegistry,
  experimental_defineJourney,
  getJourneyRegistry,
  getRegistry,
  installPolyfill,
  isNativeModelContext,
  listBridgeToolSummaries,
  parseToolArgsJson,
  registerWebMCPElements,
  setJourneyRegistry,
  validateToolDescriptor
};
//# sourceMappingURL=index.js.map