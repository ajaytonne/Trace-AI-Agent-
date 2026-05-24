import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MarkerType,
  Node,
  Edge
} from "reactflow";
import "reactflow/dist/style.css";
import {
  AlertCircle,
  Terminal,
  Cpu,
  Play,
  RotateCw,
  Sparkles,
  Layers,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  Workflow,
  ExternalLink,
  ChevronRight,
  Code,
  MessageSquare,
  Network,
  Zap,
  Check,
  Building,
  Radio,
  BookOpen
} from "lucide-react";

interface CodeNodeData {
  id: string;
  file_path: string;
  node_type: "frontend_route" | "backend_endpoint" | "database_table" | "utility_function";
  function_name: string | null;
  line_number: number;
  raw_content: string;
}

interface CodeEdgeData {
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

interface AIPatch {
  file_path: string;
  original_code: string;
  patched_code: string;
  explanation: string;
}

export default function App() {
  const [dbNodes, setDbNodes] = useState<CodeNodeData[]>([]);
  const [dbEdges, setDbEdges] = useState<CodeEdgeData[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [selectedNode, setSelectedNode] = useState<CodeNodeData | null>(null);
  
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [aiPatch, setAiPatch] = useState<AIPatch | null>(null);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"workspace" | "explain">("workspace");

  // Re-scanning Workspace
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const fetchWorkspaceAndStates = async () => {
    try {
      const response = await fetch("/api/errors");
      if (response.ok) {
        const errors = await response.json();
        setErrorLogs(errors);
      }
    } catch (e) {
      console.error("Failed to load initial error states", e);
    }
  };

  // Re-scan codebase action
  const handleRescanWorkspace = async () => {
    setIsScanning(true);
    setScanMessage("Cloning local workspace container and indexing AST tree...");
    
    try {
      // Small simulated latency for feel of ingestion engine
      await new Promise((resolve) => setTimeout(resolve, 800));
      const res = await fetch("/api/workspace/rescan", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDbNodes(data.nodes);
        setDbEdges(data.edges);
        setScanMessage("Ingestion and AST relation mappings parsed successfully!");
        setTimeout(() => setScanMessage(""), 3000);
      }
    } catch (e) {
      console.error(e);
      setScanMessage("AST ingestion failed. Standard repository tree used.");
    } finally {
      setIsScanning(false);
    }
  };

  // Trigger simulated exception immediately
  const handleTriggerSimulatedError = async () => {
    try {
      const res = await fetch("/api/errors/simulate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        // UI will also update via WebSockets, but let us update locally too
        await fetchWorkspaceAndStates();
      }
    } catch (e) {
      console.error("Error triggering simulation", e);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchWorkspaceAndStates();
    handleRescanWorkspace();
  }, []);

  // Sync state to React Flow Canvas when nodes, edges or active errors change
  useEffect(() => {
    if (dbNodes.length === 0) return;

    // Define coordinate offsets so they align beautifully
    const offsets: Record<string, { x: number; y: number }> = {
      "node_src_main_tsx": { x: 50, y: 150 },
      "node_src_App_tsx": { x: 320, y: 150 },
      "node_server_ts": { x: 600, y: 150 },
      "node_vite_config_ts": { x: 50, y: 380 },
      "node_package_json": { x: 320, y: 380 },
    };

    const nextNodes: Node[] = dbNodes.map((dbNode, i) => {
      const isOnError = errorLogs.some(
        (err) => err.status === "active" && err.file === dbNode.file_path
      );
      
      const pos = offsets[dbNode.id] || { x: 100 + i * 180, y: 200 + (i % 2) * 100 };

      // Helper function to return visual type indicator badges
      const getBadge = () => {
        switch (dbNode.node_type) {
          case "backend_endpoint": return { name: "API Route", color: "text-emerald-400 border-emerald-950 bg-emerald-950/40" };
          case "frontend_route": return { name: "UI Component", color: "text-sky-400 border-sky-950 bg-sky-950/40" };
          case "database_table": return { name: "DB Table", color: "text-amber-400 border-amber-950 bg-amber-950/40" };
          default: return { name: "Utility Group", color: "text-zinc-400 border-zinc-800 bg-zinc-900/40" };
        }
      };

      const badge = getBadge();

      return {
        id: dbNode.id,
        position: pos,
        data: {
          label: (
            <div 
              onClick={() => {
                setSelectedNode(dbNode);
                // If there's an active error on this node, pick it
                const matchedErr = errorLogs.find(e => e.status === "active" && e.file === dbNode.file_path);
                if (matchedErr) {
                  setSelectedError(matchedErr);
                  setAiPatch(null);
                  setIsTerminalOpen(true);
                }
              }}
              className={`p-4 rounded-xl font-sans text-left transition-all duration-300 cursor-pointer min-w-[230px] border relative ${
                isOnError
                  ? "bg-red-950/50 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.25)] text-red-100 animate-pulseBorder"
                  : "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 text-zinc-100 hover:shadow-lg shadow-zinc-950/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[9px] uppercase tracking-widest font-mono font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
                  {badge.name}
                </span>
                
                {isOnError ? (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600"></span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-1">
                <FileCode className={`w-4 h-4 ${isOnError ? "text-red-400" : "text-zinc-400"}`} />
                <span className="font-mono text-xs font-semibold tracking-tight truncate max-w-[170px]">{dbNode.file_path}</span>
              </div>

              <div className="text-[10px] text-zinc-400 font-mono flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/60">
                <span>AST Lines: ~{dbNode.raw_content.split("\n").length}</span>
                <span className="hover:text-zinc-200 flex items-center gap-0.5">
                  Inspect <ChevronRight className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          )
        },
        style: { background: "transparent", border: "none", padding: 0 }
      };
    });

    const nextEdges: Edge[] = dbEdges.map((dbEdge) => {
      const sourceNode = dbNodes.find(n => n.id === dbEdge.source_node_id);
      const targetNode = dbNodes.find(n => n.id === dbEdge.target_node_id);
      
      const hasSourceError = sourceNode && errorLogs.some(e => e.status === "active" && e.file === sourceNode.file_path);
      const hasTargetError = targetNode && errorLogs.some(e => e.status === "active" && e.file === targetNode.file_path);
      const isErrorFlow = hasSourceError || hasTargetError;

      return {
        id: dbEdge.id,
        source: dbEdge.source_node_id,
        target: dbEdge.target_node_id,
        animated: true,
        style: {
          stroke: isErrorFlow ? "#ef4444" : "#27272a",
          strokeWidth: isErrorFlow ? 3 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isErrorFlow ? "#ef4444" : "#27272a",
        }
      };
    });

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [dbNodes, dbEdges, errorLogs]);

  // Handle WebSocket streaming connections
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/live-events`;
    console.log("Connecting WebSocket channel to:", wsUrl);
    
    let socket: WebSocket;

    function connect() {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === "INITIAL_DATABASE_STATE") {
            setDbNodes(message.data.nodes);
            setDbEdges(message.data.edges);
            setErrorLogs(message.data.errorLogs);
          } else if (message.type === "ERROR_TRIGGERED") {
            const newErr: ErrorLog = message.data;
            setErrorLogs((prev) => {
              if (prev.some((e) => e.id === newErr.id)) return prev;
              return [newErr, ...prev];
            });
          } else if (message.type === "ERROR_RESOLVED") {
            const { error_log_id } = message.data;
            setErrorLogs((prev) =>
              prev.map((e) => (e.id === error_log_id ? { ...e, status: "resolved" } : e))
            );
          }
        } catch (e) {
          console.error("Failed to parse socket stream payload:", e);
        }
      };

      socket.onerror = (e) => {
        console.error("WebSocket connection failure, retrying...", e);
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed. Reconnecting in 5s.");
        setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (socket) socket.close();
    };
  }, []);

  // Triggering AI diagnostics self-healing pipeline
  const runSelfHealingDiagnostics = async () => {
    if (!selectedError) return;
    setIsFixing(true);
    setAiPatch(null);
    setDiagnosticLogs([]);

    const steps = [
      "🔍 Loading exception stack trace trace payload...",
      "🗂️ querying Pinecone metrics in-memory vector embeddings...",
      "🧠 Match identified: file path is '" + selectedError.file + "', function target near line " + selectedError.line,
      "⚡ Ingesting AST parsed function code chunks from filesystem...",
      "🤖 Synthesizing Zero-Shot diagnostic prompt context payload...",
      "🛰️ Transmitting stream to Gemini 3.5 Flash Model..."
    ];

    // Staggered boot logs for highly professional diagnostic animation
    for (const step of steps) {
      setDiagnosticLogs((prev) => [...prev, step]);
      await new Promise((resolve) => setTimeout(resolve, isScanning ? 200 : 350));
    }

    try {
      const response = await fetch("/api/agent/fix-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_log_id: selectedError.id }),
      });
      if (response.ok) {
        const patch: AIPatch = await response.json();
        setAiPatch(patch);
        setDiagnosticLogs((prev) => [...prev, "✨ Self-healing patch generated successfully!"]);
        // Update local status as well to sync UI immediately
        setErrorLogs((prev) =>
          prev.map((e) => e.id === selectedError.id ? { ...e, status: "resolved" } : e)
        );
      } else {
        setDiagnosticLogs((prev) => [...prev, "❌ Endpoint trace returned fault status."]);
      }
    } catch (err: any) {
      console.error(err);
      setDiagnosticLogs((prev) => [...prev, `❌ AI repair calculation failed: ${err.message}`]);
    } finally {
      setIsFixing(false);
    }
  };

  const handleApplyRepairFix = () => {
    setIsTerminalOpen(false);
    setAiPatch(null);
    setSelectedError(null);
    setDiagnosticLogs([]);
    fetchWorkspaceAndStates();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
      
      {/* GLOBAL MASTER HEADER */}
      <header className="border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-red-500/10 text-red-500 p-2 rounded-lg border border-red-500/20">
            <Network className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white font-sans">TraceAgent AI</h1>
              <span className="text-[9px] bg-red-950/60 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> SIMULATION_LIVE
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block font-mono">AST Codebase Graph Ingestion & AI Self-Remediation Engine</p>
          </div>
        </div>

        {/* Dynamic Scan status indicator */}
        {scanMessage && (
          <div className="hidden md:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-300">
            <RotateCw className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
            <span>{scanMessage}</span>
          </div>
        )}

        {/* Tab Controls and Header Action Elements */}
        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => setActiveTab("workspace")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                activeTab === "workspace"
                  ? "bg-zinc-800 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Diagnostic Center</span>
            </button>
            <button
              onClick={() => setActiveTab("explain")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                activeTab === "explain"
                  ? "bg-zinc-800 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Pitch Builder</span>
            </button>
          </div>

          <button
            onClick={handleTriggerSimulatedError}
            className="bg-red-500 hover:bg-red-400 text-zinc-950 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Simulate Outage</span>
          </button>
        </div>
      </header>

      {/* RENDER ACTIVE TAB */}
      {activeTab === "workspace" ? (
        <div className="flex flex-1 overflow-hidden relative">
          
          {/* LEFT SIDE MONITOR PANEL: REAL-TIME TELEMETRY EVENT STREAM */}
          <aside className="w-80 md:w-96 border-r border-zinc-900 bg-zinc-950 flex flex-col shrink-0 z-10">
            
            {/* INGESTION & CORE STATE SECTION */}
            <div className="p-4 border-b border-zinc-900 bg-zinc-900/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500">Repository Analyzer</span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Ingested
                </span>
              </div>
              
              <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-900 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Workflow className="text-zinc-400 w-4 h-4" />
                    <span className="text-xs text-zinc-300 font-mono">workspace_root/</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">main branch</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-900">
                    <div className="text-lg font-mono font-bold text-white">{dbNodes.length}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">AST Nodes</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-900">
                    <div className="text-lg font-mono font-bold text-white">{dbEdges.length}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">AST Edges</div>
                  </div>
                </div>

                <button
                  onClick={handleRescanWorkspace}
                  disabled={isScanning}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 text-zinc-100 py-1.5 rounded-lg text-xs font-mono transition-all border border-zinc-700 text-center flex items-center justify-center gap-2"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-red-400" : "text-zinc-400"}`} />
                  <span>{isScanning ? "Scanning..." : "Re-Scan AST Topology"}</span>
                </button>
              </div>
            </div>

            {/* LIVE STREAM SECTION */}
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-900/5 flex items-center justify-between sticky top-0 backdrop-blur z-20">
                <div className="flex items-center gap-2">
                  <Terminal className="text-red-400 w-3.5 h-3.5" />
                  <span className="font-semibold text-[10px] tracking-wider uppercase text-zinc-400 font-mono">Live Telemetry Events</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">
                  {errorLogs.filter(e => e.status === "active").length} active
                </span>
              </div>

              <div className="p-4 space-y-3 flex-1">
                {errorLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                    <ShieldCheck className="w-8 h-8 text-emerald-500 animate-pulse" />
                    <div>
                      <p className="text-xs text-zinc-300 font-mono">All operations nominal</p>
                      <p className="text-[10px] text-zinc-500">Awaiting live exception trace streams...</p>
                    </div>
                  </div>
                ) : (
                  errorLogs.map((log) => {
                    const isActive = log.status === "active";
                    return (
                      <div
                        key={log.id}
                        onClick={() => {
                          setSelectedError(log);
                          setAiPatch(null);
                          setIsTerminalOpen(true);
                        }}
                        className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 relative overflow-hidden group ${
                          isActive
                            ? "bg-red-950/20 border-red-900/50 hover:border-red-500 hover:shadow-red-950/20 shadow-md"
                            : "bg-zinc-900/30 border-zinc-900/60 hover:border-zinc-800 text-zinc-400"
                        }`}
                      >
                        {/* Red warning strip on left edge */}
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 animate-pulse"></div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-mono font-bold ${isActive ? "text-red-400" : "text-zinc-500"}`}>
                            {log.endpoint}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase">
                            {isActive ? "🔴 CRASH" : "🟢 RESOLVED"}
                          </span>
                        </div>

                        <p className={`text-xs font-mono line-clamp-2 p-1.5 rounded ${isActive ? "bg-red-950/40 text-red-200" : "bg-zinc-950/40 text-zinc-500"}`}>
                          {log.error_message}
                        </p>

                        <div className="text-[10px] text-zinc-500 flex items-center justify-between font-mono mt-1">
                          <span>{log.file}:{log.line}</span>
                          <span className="flex items-center gap-0.5 text-zinc-400 group-hover:text-white transition-all text-[9px]">
                            Diagnosis <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* STACK GUIDE SIGNATURE PANEL */}
            <div className="p-4 border-t border-zinc-900 bg-zinc-900/15">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] tracking-widest font-mono uppercase font-extrabold text-zinc-300">Workspace Telemetry</span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-normal font-sans">
                Self-healing pipelines operate end-to-end. Click an error container to launch real-time sandbox repairs.
              </p>
            </div>
          </aside>

          {/* MIDDLE/RIGHT PANEL: THE INTERACTIVE CANVAS */}
          <main className="flex-1 h-full relative bg-zinc-950">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              maxZoom={2}
              minZoom={0.5}
            >
              <Background color="#1c1917" gap={18} size={1} />
              <Controls className="bg-zinc-900 border-zinc-800 text-white fill-zinc-100" />
            </ReactFlow>

            {/* Quick Helper Widget */}
            <div className="absolute bottom-5 right-5 bg-zinc-950/80 border border-zinc-900 p-2.5 rounded-lg text-[10px] font-mono text-zinc-400 max-w-xs pointer-events-none backdrop-blur shadow-xl">
              <div className="font-bold text-zinc-300 mb-1 flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-zinc-400" />
                <span>RELATIONSHIP TOPOLOGIES</span>
              </div>
              <p>Green lines represent normal imports & call sequences. Pings indicate active websocket heartbeats. Red borders denote crash exceptions.</p>
            </div>
          </main>

          {/* DYNAMIC TERM SHEET DIALOG: "TRACEAGENT TERMINAL" (Drawer implementation) */}
          {isTerminalOpen && selectedError && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex justify-end animate-fadeIn">
              <div className="w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 h-full shadow-2xl flex flex-col font-mono text-zinc-100 overflow-hidden relative">
                
                {/* Drawer Heading bar */}
                <div className="p-6 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20 text-red-400">
                      <Cpu className="w-5 h-5 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
                        TraceAgent Self-Healing Agent
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Automated Diagnostics & Mitigation Control Console</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsTerminalOpen(false);
                      setAiPatch(null);
                      setDiagnosticLogs([]);
                    }}
                    className="text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-md p-1.5 text-xs font-mono"
                  >
                    CLOSE [ESC]
                  </button>
                </div>

                {/* Main scrollable layout inside agent drawer */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6 text-xs font-mono">
                  
                  {/* CRASH DETAILS BOX */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="font-extrabold uppercase tracking-wide text-zinc-300">🚨 Exception Fault Metadata</span>
                    </div>
                    
                    <div className="bg-zinc-950 p-4 rounded-xl border border-red-950/60 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] pb-2 border-b border-zinc-900/60 gap-1.5">
                        <span className="text-zinc-500">API route: <strong className="text-zinc-300">{selectedError.endpoint}</strong></span>
                        <span className="text-zinc-500 text-left sm:text-right">Code Source File: <strong className="text-zinc-300">{selectedError.file}:{selectedError.line}</strong></span>
                      </div>
                      <p className="text-red-400 font-semibold bg-red-950/20 p-2.5 rounded-lg border border-red-900/10" style={{ wordBreak: 'break-all' }}>
                        {selectedError.error_message}
                      </p>
                    </div>
                  </div>

                  {/* ACTIVE REQUISITES BLOCK */}
                  <div className="space-y-2.5">
                    <span className="font-extrabold uppercase tracking-wide text-zinc-300 block">⚡ SYSTEM CALL STACK</span>
                    <pre className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 text-zinc-400 overflow-x-auto whitespace-pre leading-relaxed text-[11px]">
                      {selectedError.stack_trace}
                    </pre>
                  </div>

                  {/* DIAGNOISTIC FEEDBACK LOGS & BUTTON FLOW */}
                  <div className="space-y-4">
                    
                    {/* BUTTON ACTIONS */}
                    {!aiPatch && !isFixing && (
                      <button
                        onClick={runSelfHealingDiagnostics}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[0_4px_15px_rgba(16,185,129,0.2)] text-sm"
                      >
                        <Network className="w-4.5 h-4.5 fill-current" />
                        <span>Deploy AI Diagnostics (Gemini 3.5 RAG)</span>
                      </button>
                    )}

                    {/* INTERFACE RENDERING STREAMING LOADER LOGS */}
                    {diagnosticLogs.length > 0 && (
                      <div className="space-y-1.5 p-4 rounded-xl bg-zinc-950 border border-zinc-900">
                        <span className="text-[10px] text-zinc-500 uppercase block font-semibold mb-2">Diagnostic Pipeline Tasks</span>
                        {diagnosticLogs.map((logStr, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed select-none animate-fadeIn text-emerald-400 font-mono">
                            {logStr.includes("❌") ? (
                              <span className="text-red-400">{logStr}</span>
                            ) : logStr.includes("✨") ? (
                              <span className="text-emerald-300 font-bold">{logStr}</span>
                            ) : (
                              <>
                                <span className="opacity-40">{">"}</span>
                                <span>{logStr}</span>
                              </>
                            )}
                          </div>
                        ))}
                        {isFixing && (
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 pl-3 pt-2">
                            <RotateCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                            <span>Computing LLM semantic graph changes...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PATCH COMPARISON DIFF VIEW COMPONENT */}
                    {aiPatch && (
                      <div className="space-y-4 animate-fadeIn">
                        
                        <div className="border border-emerald-900/50 bg-emerald-950/10 p-4 rounded-xl text-zinc-300 leading-normal">
                          <span className="font-extrabold text-emerald-400 block mb-1.5 text-xs">💡 AGENT BUG ROOT-CAUSE ANALYSIS:</span>
                          <p className="text-xs leading-relaxed text-zinc-300">{aiPatch.explanation}</p>
                        </div>

                        {/* SIDE-BY-SIDE SIDE PANEL FOR DIFFS */}
                        <div className="space-y-2.5">
                          <span className="text-zinc-400 font-extrabold uppercase block tracking-wider">🛠️ PROPOSED DIFF CODESPACE REPAIR:</span>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                            {/* RED OUTGOING CODE BLOCKS */}
                            <div className="bg-red-950/15 border border-red-900/30 rounded-xl p-4 flex flex-col relative">
                              <span className="text-red-400 font-bold bg-red-950/40 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider absolute top-3 right-3 border border-red-900/30">
                                Original System Code
                              </span>
                              <span className="font-semibold text-[10px] text-zinc-500 pb-2 mb-3 border-b border-zinc-800">
                                {selectedError.file} : Line {selectedError.line}
                              </span>
                              <pre className="text-red-300/80 bg-red-950/10 p-2.5 rounded-lg overflow-x-auto text-[10.5px] leading-relaxed whitespace-pre-wrap select-all font-mono min-h-[120px]">
                                {aiPatch.original_code}
                              </pre>
                            </div>

                            {/* GREEN INCOMING PATCH CODES */}
                            <div className="bg-emerald-950/15 border border-emerald-900/30 rounded-xl p-4 flex flex-col relative">
                              <span className="text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider absolute top-3 right-3 border border-emerald-900/30">
                                Proposed Bugfix
                              </span>
                              <span className="font-semibold text-[10px] text-zinc-500 pb-2 mb-3 border-b border-zinc-800">
                                Refined Context Guard
                              </span>
                              <pre className="text-emerald-300 bg-emerald-950/10 p-2.5 rounded-lg overflow-x-auto text-[10.5px] leading-relaxed whitespace-pre-wrap select-all font-mono min-h-[120px]">
                                {aiPatch.patched_code}
                              </pre>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleApplyRepairFix}
                          className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold py-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 text-sm shadow-xl"
                        >
                          <Check className="w-4 h-4 text-zinc-950" />
                          <span>Commit & Hot Patch System Live</span>
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        
        /* THE INDUSTRIAL EXPERT EXPLAINER TAB */
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-6 md:p-12 space-y-12">
          
          <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            
            {/* Introductory pitch */}
            <div className="space-y-4">
              <span className="text-xs uppercase font-mono font-bold tracking-widest text-emerald-400 px-3 py-1 bg-emerald-950/30 rounded-md border border-emerald-900/30">
                INDUSTRIAL ENGINEER'S FIELD GUIDE
              </span>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">How to Pitch and Explain TraceAgent AI</h2>
              <p className="text-zinc-300 text-sm leading-relaxed">
                When presenting TraceAgent AI to an active industry expert, technical director, principal architect, or venture partner, avoid standard marketing slides. Speak their language: focus on **Mean Time to Detection (MTTD)**, **Mean Time to Resolution (MTTR)**, **observability pipeline consolidation**, and **deterministic machine loop control**.
              </p>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
                    <Building className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-white text-sm tracking-tight">1. Core Value Statement (The "Why")</h4>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  "In traditional DevOps architectures, understanding the cascade implications of small changes is difficult. When a service throws errors, developers pivot between alert logs, stack traces, local code repos, and connection charts. We close this cycle by integrating telemetry streams directly on visual AST dependency nodes in real-time."
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <div className="bg-sky-500/15 p-1.5 rounded-lg border border-sky-500/10 text-sky-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-white text-sm tracking-tight">2. Semantic AST-Based Mapping</h4>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  "Instead of basic text splitters which slice statements mid-expression and destroy local coding context, we use a custom Abstract Syntax Tree parser. We map high-level blocks including ClassDef, FunctionDef, and RouteDefinitions—storing their imports, dependencies, and upstream calling structures in relation tables."
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <div className="bg-purple-500/15 p-1.5 rounded-lg border border-purple-500/10 text-purple-400">
                    <Radio className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-white text-sm tracking-tight">3. Real-Time Telemetry Pipeline</h4>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  "We run persistent WebSockets connections to broadcast telemetry events directly into the user interface. When standard services throw standard 500 server crashes or unexpected logic errors, the active topology graph pulsates in red and updates paths immediately, highlighting cascades visually, instantly."
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <div className="bg-amber-500/15 p-1.5 rounded-lg border border-amber-500/10 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-white text-sm tracking-tight">4. Context-Aware AI RAG Repair</h4>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  "When diagnostics boot, we pull the specific AST block, adjacent variables, input endpoints, and stack trace structures. Feeding this scoped context to the Gemini model inside a typed schema ensures parseable JSON output, rendering a beautiful split-screen diff comparison and guaranteeing code reliability."
                </p>
              </div>

            </div>

            {/* F.A.Q. interview section */}
            <div className="border border-zinc-900 rounded-3xl overflow-hidden shadow-xl bg-zinc-900/20">
              <div className="bg-zinc-900/50 p-6 border-b border-zinc-900 flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-zinc-300" />
                <h3 className="text-base font-extrabold text-white">Handling Technical Deep-Dive Interview Audits</h3>
              </div>
              
              <div className="divide-y divide-zinc-900 font-sans text-xs">
                
                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-red-400 font-bold">Q:</span>
                    <strong className="text-zinc-100">"How do you resolve scaling bottlenecks with very large repositories?"</strong>
                  </div>
                  <div className="text-zinc-400 leading-relaxed pl-6">
                    <strong className="text-white block mb-1">Answer Strategy:</strong>
                    "We ingest code incrementally connected via commit-hooks. We only re-parse and tokenise files that underwent modification. We create index relationship hashes of components and parent dependency links, allowing us to update specific components on the interactive canvas instead of re-graphing the complete app."
                  </div>
                </div>

                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-red-400 font-bold">Q:</span>
                    <strong className="text-zinc-100">"Why are full-duplex WebSockets preferred over SSE or long polling here?"</strong>
                  </div>
                  <div className="text-zinc-400 leading-relaxed pl-6">
                    <strong className="text-white block mb-1">Answer Strategy:</strong>
                    "While SSE handles general downstream unidirectional server broadcasts perfectly, WebSockets provide a true full-duplex persistent channel. This allows developers to toggle visual states, run continuous heartbeats, send query actions (like triggered repairs), and stream binary diagnostic bundles over a singular stable TCP handle."
                  </div>
                </div>

                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-red-400 font-bold">Q:</span>
                    <strong className="text-zinc-100">"How do we prevent safe deployment failures where AI break production?"</strong>
                  </div>
                  <div className="text-zinc-400 leading-relaxed pl-6">
                    <strong className="text-white block mb-1">Answer Strategy:</strong>
                    "The model output is strictly bounded. Rather than applying fixes automatically without human gates, we render modifications as a side-by-side comparative git-style diff markup. This allows engineers to verify corrections before initiating 'hot deploy' commands which run test suites before merging."
                  </div>
                </div>

              </div>
            </div>

            {/* Quick Pitch Summary block */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="text-white font-bold text-sm">Now, go ahead and test the prototype live!</div>
                <div className="text-xs text-zinc-400 leading-normal">Use the "Simulate Outage" triggers to watch the graphs, edges, and AI diagnosticians in action.</div>
              </div>
              <button
                onClick={() => setActiveTab("workspace")}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold px-5 py-2.5 rounded-xl transition-all font-mono text-xs cursor-pointer inline-flex items-center gap-1.5 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0"
              >
                <span>Launch Active Graph Viewer</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
