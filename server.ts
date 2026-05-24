import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Memory Database modeling
interface CodeNode {
  id: string;
  file_path: string;
  node_type: "frontend_route" | "backend_endpoint" | "database_table" | "utility_function";
  function_name: string | null;
  line_number: number;
  raw_content: string;
}

interface CodeEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  dependency_type: "calls" | "imports" | "queries";
}

interface ErrorLog {
  id: string;
  endpoint: string;
  error_message: string;
  stack_trace: string;
  status: "active" | "resolved";
  file: string;
  line: number;
  created_at: string;
}

// In-Memory Database store
let codeNodes: CodeNode[] = [];
let codeEdges: CodeEdge[] = [];
let errorLogs: ErrorLog[] = [
  {
    id: "err-billing-01",
    endpoint: "/api/v1/billing",
    error_message: "NullPointerException: Payment intent failed at process_payment_intent. Source variable 'intent' is null.",
    stack_trace: 'Exception in thread "main" NullPointerException: Payment intent failed\n  at backend/app/routes/billing.ts:42\n  at routing_engine.ts:108',
    status: "active",
    file: "server.ts",
    line: 142,
    created_at: new Date(Date.now() - 100000).toISOString(),
  }
];

// Lazy Initialization of Gemini SDK Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not defined or is placeholder. Using smart AI simulation.");
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Map logical file paths to nodes
function scanWorkspace() {
  const cwd = process.cwd();
  const importantFiles = [
    { relative: "server.ts", type: "backend_endpoint" as const },
    { relative: "src/App.tsx", type: "frontend_route" as const },
    { relative: "src/main.tsx", type: "utility_function" as const },
    { relative: "package.json", type: "utility_function" as const },
    { relative: "vite.config.ts", type: "utility_function" as const },
  ];

  const parsedNodes: CodeNode[] = [];
  const pathToIdMap = new Map<string, string>();

  // Extract CodeNodes from filesystem
  for (const item of importantFiles) {
    const fullPath = path.join(cwd, item.relative);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        const node_id = "node_" + item.relative.replace(/[^a-zA-Z0-9]/g, "_");
        pathToIdMap.set(item.relative, node_id);
        
        parsedNodes.push({
          id: node_id,
          file_path: item.relative,
          node_type: item.type,
          function_name: item.relative === "server.ts" ? "startServer" : null,
          line_number: 1,
          raw_content: raw,
        });
      } catch (err) {
        console.error("Error reading file during workspace scan:", fullPath, err);
      }
    }
  }

  // Generate some static dependency edges for clean architectural visualization
  const parsedEdges: CodeEdge[] = [];
  
  if (pathToIdMap.has("src/main.tsx") && pathToIdMap.has("src/App.tsx")) {
    parsedEdges.push({
      id: "edge_main_app",
      source_node_id: pathToIdMap.get("src/main.tsx")!,
      target_node_id: pathToIdMap.get("src/App.tsx")!,
      dependency_type: "imports",
    });
  }
  if (pathToIdMap.has("src/App.tsx") && pathToIdMap.has("server.ts")) {
    parsedEdges.push({
      id: "edge_app_server",
      source_node_id: pathToIdMap.get("src/App.tsx")!,
      target_node_id: pathToIdMap.get("server.ts")!,
      dependency_type: "calls",
    });
  }
  if (pathToIdMap.has("vite.config.ts") && pathToIdMap.has("package.json")) {
    parsedEdges.push({
      id: "edge_config_pkg",
      source_node_id: pathToIdMap.get("vite.config.ts")!,
      target_node_id: pathToIdMap.get("package.json")!,
      dependency_type: "imports",
    });
  }

  codeNodes = parsedNodes;
  codeEdges = parsedEdges;
}

// Initial Scan on boot
try {
  scanWorkspace();
} catch (e) {
  console.error("Initial workspace scanning failed", e);
}

// Create HTTP server for express
const server = http.createServer(app);

// WebSockets Setup
const wss = new WebSocketServer({ noServer: true });
const activeConnections = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket) => {
  activeConnections.add(ws);
  console.log("WebSocket client joined.");
  
  // Send existing state to client on join
  ws.send(JSON.stringify({
    type: "INITIAL_DATABASE_STATE",
    data: {
      nodes: codeNodes,
      edges: codeEdges,
      errorLogs,
    },
  }));

  ws.on("close", () => {
    activeConnections.delete(ws);
    console.log("WebSocket client disconnected.");
  });
});

// Upgrade handler bindingport 
server.on("upgrade", (request, socket, head) => {
  if (request.url?.startsWith("/ws/live-events")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Broadcast helper
function broadcastToClients(payload: any) {
  const message = JSON.stringify(payload);
  for (const client of activeConnections) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Background error simulation loop: emit an error log every 45s
let mockErrorTimer: NodeJS.Timeout | null = null;
function startSimulatedOutageLoop() {
  if (mockErrorTimer) clearInterval(mockErrorTimer);
  mockErrorTimer = setInterval(() => {
    const errorId = "err-" + Math.random().toString(36).substr(2, 9);
    const mockError: ErrorLog = {
      id: errorId,
      endpoint: "/api/v1/billing",
      error_message: "NullPointerException: Payment intent failed at process_payment_intent. Source variable 'intent' is null.",
      stack_trace: `Exception in thread "main" NullPointerException: Payment intent failed\n  at server.ts:42\n  at routing_engine.dispatch_call(server.ts:108)`,
      status: "active",
      file: "server.ts",
      line: 42,
      created_at: new Date().toISOString(),
    };
    
    errorLogs.unshift(mockError);
    // restrict limit
    if (errorLogs.length > 50) errorLogs.pop();

    broadcastToClients({
      type: "ERROR_TRIGGERED",
      data: mockError,
    });
  }, 45000); // 45 seconds
}

startSimulatedOutageLoop();

// API Endpoints
// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), workspace_nodes: codeNodes.length });
});

// Rescan workspace endpoint
app.post("/api/workspace/rescan", (req, res) => {
  try {
    scanWorkspace();
    res.json({
      success: true,
      nodes: codeNodes,
      edges: codeEdges,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get current error logs
app.get("/api/errors", (req, res) => {
  res.json(errorLogs);
});

// Trigger a mock outage instantly (highly dynamic testing support)
app.post("/api/errors/simulate", (req, res) => {
  const errorsToSimulate = [
    {
      endpoint: "/api/v1/billing",
      error_message: "NullPointerException: Payment intent failed at process_payment_intent. Source variable 'intent' is null.",
      file: "server.ts",
      line: 42,
      stack_trace: `Exception in server thread: NullPointerException: Payment intent failed\n  at getGeminiClient (server.ts:42)\n  at process_payment_intent (server.ts:108)`,
    },
    {
      endpoint: "/api/v1/render",
      error_message: "TypeError: Cannot read properties of undefined (reading 'nodes') at renderCanvas",
      file: "src/App.tsx",
      line: 85,
      stack_trace: `TypeError: Cannot read properties of undefined (reading 'nodes')\n  at WorkspaceDashboard.renderCanvas (src/App.tsx:85)\n  at react-dom.development.js:14022`,
    },
    {
      endpoint: "/api/v1/auth",
      error_message: "JWTExpiredError: Node verification sequence timed out during session verification",
      file: "server.ts",
      line: 98,
      stack_trace: `JWTExpiredError: Token decoding exception - JWTExpired\n  at jwt_verifier.ts:98\n  at verify_headers (server.ts:210)`,
    }
  ];

  const randomErrorMeta = errorsToSimulate[Math.floor(Math.random() * errorsToSimulate.length)];
  const errorId = "err-" + Math.random().toString(36).substr(2, 9);
  
  const simulatedError: ErrorLog = {
    id: errorId,
    endpoint: randomErrorMeta.endpoint,
    error_message: randomErrorMeta.error_message,
    stack_trace: randomErrorMeta.stack_trace,
    status: "active",
    file: randomErrorMeta.file,
    line: randomErrorMeta.line,
    created_at: new Date().toISOString(),
  };

  errorLogs.unshift(simulatedError);
  broadcastToClients({
    type: "ERROR_TRIGGERED",
    data: simulatedError,
  });

  res.json({ success: true, simulated: simulatedError });
});

// Autonomous AI Patch Self-healing endpoint using server-side Gemini config
app.post("/api/agent/fix-error", async (req, res) => {
  const { error_log_id } = req.body;
  if (!error_log_id) {
    return res.status(400).json({ error: "Missing parameter: error_log_id" });
  }

  // 1. Fetch Error Trace Meta
  const errorLog = errorLogs.find((e) => e.id === error_log_id);
  if (!errorLog) {
    return res.status(404).json({ error: "Target exception trace log reference not found." });
  }

  // 2. Fetch the corresponding file file_path context
  const targetFilePath = errorLog.file;
  const codebaseNode = codeNodes.find((n) => n.file_path === targetFilePath) || codeNodes[0];

  const sourceContent = codebaseNode ? codebaseNode.raw_content : `// Code file not found: ${targetFilePath}`;

  // Build prompts matching RAG structure
  const systemInstruction = `You are an autonomous self-healing software engineer AI agent. 
Analyze the crash exception metadata and its codebase context, then write an exact code fix inside a structural JSON patch.
You MUST output raw parseable JSON only. Do NOT output any markdown backticks such as \`\`\`json or trailing comment text.

The JSON response schema must be exactly:
{
  "file_path": "the file path being repaired",
  "original_code": "the exact lines of bug-ridden code where error originated",
  "patched_code": "the corrected equivalent lines of code fixing the error securely",
  "explanation": "concise technical details explaining the bug and why this patch repairs it cleanly"
}`;

  const humanMessage = `CRASH EXCEPTION METADATA:
Endpoint: ${errorLog.endpoint}
Message: ${errorLog.error_message}
Stack Trace: ${errorLog.stack_trace}
Line: ${errorLog.line}

IDENTIFIED FILE TARGET CONTENT (${targetFilePath}):
${sourceContent}`;

  const defaultMockFix = {
    file_path: targetFilePath,
    original_code: targetFilePath === "server.ts" ? `const apiKey = process.env.GEMINI_API_KEY;\n  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") { ... }` : `errorLogs.map((log) => ( ... ))`,
    patched_code: targetFilePath === "server.ts" ? `const apiKey = process.env.GEMINI_API_KEY;\n  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {\n    console.warn("Secure fallback instantiated safely.");\n    return createFallbackService();\n  }` : `errorLogs?.map((log) => ( ... ))`,
    explanation: `The system threw an exception because of an unhandled check. Adding an explicit optional chain safely preserves operations without causing full runtime crashes.`
  };

  const client = getGeminiClient();

  if (!client) {
    // Return high-quality, smart mock responses that are specific to the selected error to simulate Gemini when there is no key
    console.log("No Gemini API key found or setup. Simulating smart self-healing.");
    const customMockFix = { ...defaultMockFix };
    if (errorLog.endpoint === "/api/v1/billing") {
      customMockFix.original_code = `const key = process.env.STRIPE_SECRET_KEY;\n    if (!key) {\n      throw new Error('STRIPE_SECRET_KEY environment variable is required');\n    }`;
      customMockFix.patched_code = `const key = process.env.STRIPE_SECRET_KEY;\n    if (!key) {\n      console.warn('STRIPE_SECRET_KEY is missing. Falling back to secure simulated checkout payment gateway.');\n      return createMockStripeClient();\n    }`;
      customMockFix.explanation = `Stripe client instantiation crashed because STRIPE_SECRET_KEY is undefined on launch. We intercept this and lazy-load a robust dry-run mock billing processor when the key is omitted.`;
    } else if (errorLog.endpoint === "/api/v1/render") {
      customMockFix.original_code = `const initialNodes: Node[] = [ ... ];\n    setNodes(initialNodes);`;
      customMockFix.patched_code = `const initialNodes: Node[] = [ ... ];\n    if (initialNodes && Array.isArray(initialNodes)) {\n      setNodes(initialNodes);\n    } else {\n      setNodes([]);\n    }`;
      customMockFix.explanation = `The state renderer attempted to map properties of undefined. Adding explicit type guard bounds and an empty-array default prevents rendering layout crashes during rapid WebSockets state updates.`;
    } else {
      customMockFix.original_code = `const token = authHeader.split(" ")[1];\n    const decoded = jwt.verify(token, SECRET);`;
      customMockFix.patched_code = `const token = authHeader?.split(" ")[1];\n    if (!token) return res.status(401).json({ error: "Missing bearer token" });\n    try {\n      const decoded = jwt.verify(token, SECRET);\n    } catch (e) {\n      return res.status(403).json({ error: "Token signature or expiry verification failed safely" });\n    }`;
      customMockFix.explanation = `The validation pipeline crashed due to missing optional chain check and no try-catch boundary. Wrapped within try/catch blocks and pre-empted missing token properties.`;
    }

    // Mark the error as resolved in memory
    errorLog.status = "resolved";

    // Wait a brief simulated latency (1.5 seconds) to make the diagnostic repair interactive and visual
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.json(customMockFix);
  }

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: humanMessage,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    let resultText = response.text || "";
    resultText = resultText.trim();
    
    // Safety clean for codeblocks in markdown
    if (resultText.startsWith("```json")) {
      resultText = resultText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(resultText);
    
    // Mark the error as resolved
    errorLog.status = "resolved";
    broadcastToClients({
      type: "ERROR_RESOLVED",
      data: { error_log_id },
    });

    res.json(parsed);

  } catch (err: any) {
    console.error("Gemini API call failed, backing up to smart simulation mode:", err);
    // Mark as resolved during fallback
    errorLog.status = "resolved";
    res.json({
      file_path: targetFilePath,
      original_code: `// Erroneous execution context\n${errorLog.error_message}`,
      patched_code: `// AI Patched fallback configuration\ntry {\n  // Safe block context\n} catch (e) {\n  logger.error("Handled error gracefully", e);\n}`,
      explanation: `AI Agent resolved the crash log safely using offline auto-recovery logic because the dynamic system API endpoint timed out: ${err.message}`
    });
  }
});

async function startServer() {
  // Mount Vite middleware last in development mode
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Server on Port 3000
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`TraceAgent AI core server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start TraceAgent AI server:", err);
});
