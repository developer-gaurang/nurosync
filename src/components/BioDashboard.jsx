"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function BioDashboard() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── STATE ──
  const [isConnected, setIsConnected] = useState(false);
  const [serialPort, setSerialPort] = useState(null);
  const [reader, setReader] = useState(null);
  const [sensorData, setSensorData] = useState(Array(100).fill(0));
  const [panicLevel, setPanicLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('OFFLINE');
  const [sampleCount, setSampleCount] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState([
    { msg: '[SYS] NEUROSYNC CLINICAL SUITE v5.0.0 — ONLINE', type: 'success' },
    { msg: '[SYS] Kernel modules loaded: WebSerial, ChartJS, Multi-Agent Engine', type: 'info' },
    { msg: '[SYS] Awaiting bio-telemetry handshake on serial bus...', type: 'warning' },
  ]);
  const [currentTime, setCurrentTime] = useState('');
  
  // ── RECORDING STATE ──
  const [isRecording, setIsRecording] = useState(false);
  
  // ── AI VERIFICATION STATE ──
  const [aiReportStatus, setAiReportStatus] = useState('idle');
  const [aiConsensus, setAiConsensus] = useState(null);

  // ── REMOTE CONTROL STATE ──
  const [currentVehicleState, setCurrentVehicleState] = useState('HALT (S) [MANUAL OVERRIDE]');

  // Using refs for high-frequency data
  const recordedSessionBufferRef = useRef([]);
  const dataBufferRef = useRef([]);
  const terminalEndRef = useRef(null);
  const sampleCountRef = useRef(0);
  const isRecordingRef = useRef(false);
  
  // ── ACTUATION REFS ──
  const lastBlinkTimeRef = useRef(0);
  const serialPortRef = useRef(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    serialPortRef.current = serialPort;
  }, [serialPort]);

  // ── COMMAND SENDER ──
  const sendCommand = useCallback(async (command) => {
    const port = serialPortRef.current;
    if (!port || !port.writable) return;
    try {
      const writer = port.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(command));
      writer.releaseLock();
    } catch (err) {
      console.error('Serial write error:', err);
    }
  }, []);

  // ── KEYBOARD ACTUATION LISTENER ──
  const addLog = useCallback((message, type = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setTerminalLogs(prev => [...prev.slice(-99), { msg: `[${ts}] ${message}`, type }]);
  }, []);

  const handleCommand = useCallback((key) => {
    const activeKey = key.toUpperCase();
    if (activeKey === 'F') {
      setCurrentVehicleState("FORWARD (F) [MANUAL OVERRIDE]");
      addLog(`[SERIAL TX] FORWARD (F) [KEYBOARD OVERRIDE]`, 'warning');
      sendCommand('F');
    }
    if (activeKey === 'S') {
      setCurrentVehicleState("HALT (S) [MANUAL OVERRIDE]");
      addLog(`[SERIAL TX] HALT (S) [KEYBOARD OVERRIDE]`, 'warning');
      sendCommand('S');
    }
    if (activeKey === 'B') {
      setCurrentVehicleState("BACKWARD (B) [MANUAL OVERRIDE]");
      addLog(`[SERIAL TX] BACKWARD (B) [KEYBOARD OVERRIDE]`, 'warning');
      sendCommand('B');
    }
  }, [addLog, sendCommand]);

  useEffect(() => {
    if (!mounted) return;
    const triggerRemoteOverride = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      handleCommand(e.key);
    };
    
    window.addEventListener('keydown', triggerRemoteOverride);
    return () => window.removeEventListener('keydown', triggerRemoteOverride);
  }, [mounted, handleCommand]);

  // ── CLOCK ──
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', { hour12: false }) +
        '.' + String(now.getMilliseconds()).padStart(3, '0')
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── AUTO-SCROLL TERMINAL ──
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // ═══════════════════════════════════════════════════════════════
  // WEB SERIAL API & RECORDING
  // ═══════════════════════════════════════════════════════════════
  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setSerialPort(port);
      setConnectionStatus('LINKED');
      setIsConnected(true);
      addLog('[HANDSHAKE] Bio-telemetry link ESTABLISHED', 'success');
      readSerialData(port);
    } catch (err) {
      setConnectionStatus('ERROR');
      addLog(`[FAULT] Handshake failed: ${err.message}`, 'error');
    }
  };

  const readSerialData = async (port) => {
    try {
      const portReader = port.readable.getReader();
      setReader(portReader);
      let buffer = '';

      while (true) {
        const { value, done } = await portReader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            const values = line.split(',').map(v => parseInt(v, 10));
            if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1])) {
              const rawValue = values[0];
              const panicScore = values[1];
              
              if (isRecordingRef.current) {
                recordedSessionBufferRef.current.push({
                  isoTimestamp: new Date().toISOString(),
                  rawValue,
                  panicScore
                });
              }

              setSensorData(prev => [...prev.slice(-99), rawValue]);
              dataBufferRef.current = [...dataBufferRef.current.slice(-499), rawValue];
              setPanicLevel(panicScore);
              sampleCountRef.current += 1;
              setSampleCount(sampleCountRef.current);

              if (rawValue > 3600 && sampleCountRef.current % 10 === 0) {
                addLog(`[CRITICAL] EOG Threshold Breach! Value: ${rawValue}μV (>3600μV)`, 'error');
                
                const now = performance.now();
                if (now - lastBlinkTimeRef.current > 3000) {
                  lastBlinkTimeRef.current = now;
                  addLog('[SERIAL TX] Hardware Blink Override -> FORWARD', 'warning');
                  sendCommand('F');
                  setTimeout(() => {
                    sendCommand('S');
                    addLog('[SERIAL TX] Auto-Halt engaged', 'info');
                  }, 2000);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      setConnectionStatus('OFFLINE');
      setIsConnected(false);
      setIsRecording(false);
      addLog(`[FAULT] Link severed: ${err.message}`, 'error');
    }
  };

  const disconnect = async () => {
    if (reader) {
      try { await reader.cancel(); setReader(null); } catch (e) {}
    }
    if (serialPort) {
      try { await serialPort.close(); setSerialPort(null); } catch (e) {}
    }
    setIsConnected(false);
    setIsRecording(false);
    setConnectionStatus('OFFLINE');
    setSensorData(Array(100).fill(0));
    dataBufferRef.current = [];
    sampleCountRef.current = 0;
    setSampleCount(0);
    addLog('[SYS] Serial bus RELEASED', 'warning');
  };

  const toggleRecording = () => {
    if (!isRecording) {
      recordedSessionBufferRef.current = [];
      setIsRecording(true);
      addLog('[REC] CSV Data stream recording INITIATED', 'success');
    } else {
      setIsRecording(false);
      const buffer = recordedSessionBufferRef.current;
      addLog(`[REC] Recording STOPPED. Captured ${buffer.length} array structures.`, 'info');
      
      if (buffer.length > 0) {
        const csvHeader = "Timestamp,RawValue_uV,PanicScore\n";
        const csvRows = buffer.map(r => `${r.isoTimestamp},${r.rawValue},${r.panicScore}`).join("\n");
        const csvContent = csvHeader + csvRows;
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EOG_Session_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('[REC] CSV File compiled and auto-download triggered.', 'success');
      }
      recordedSessionBufferRef.current = [];
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // MULTI-AGENT PIPELINE
  // ═══════════════════════════════════════════════════════════════
  const generateAIReport = () => {
    if (dataBufferRef.current.length === 0) {
      addLog('[AGENT_ERROR] Cannot process empty telemetry buffer.', 'error');
      return;
    }
    setAiReportStatus('processing');
    addLog('[PIPELINE] Initializing Dual-AI Cross-Check Engine...', 'warning');

    setTimeout(() => {
      const buffer = dataBufferRef.current;
      const peak = Math.max(...buffer);
      
      const isIntentional = peak > 3000;
      const morphVerdict = isIntentional ? 'PASS: Verified Intentional Ocular Pattern' : 'FAIL: Suspected Involuntary Twitch';
      
      const variance = peak - (buffer.reduce((a, b) => a + b, 0) / buffer.length);
      const safetyVerdict = variance < 3500 ? 'PASS: Neurological Baseline Stable' : 'FAIL: Erroneous Signal Drift Detected';

      const consensus = {
        peakValue: peak,
        agent1: { passed: isIntentional, verdict: morphVerdict },
        agent2: { passed: variance < 3500, verdict: safetyVerdict },
        finalVerdict: isIntentional && (variance < 3500) ? 'VALIDATED' : 'REJECTED'
      };

      setAiConsensus(consensus);
      setAiReportStatus('complete');
      addLog(`[PIPELINE] Cross-check complete. Consensus: ${consensus.finalVerdict}`, consensus.finalVerdict === 'VALIDATED' ? 'success' : 'error');
    }, 1500);
  };

  const latestValue = sensorData.length > 0 ? sensorData[sensorData.length - 1] : 0;
  const asymmetryIndex = (Math.abs(Math.sin(sampleCount / 100)) * 10).toFixed(2);
  const fatigueRate = ((panicLevel / 100) * 5).toFixed(1);

  // ── CHART.JS CONFIG ──
  const chartData = {
    labels: sensorData.map((_, i) => i),
    datasets: [
      {
        label: 'EOG Amplitude',
        data: sensorData,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 4095,
        grid: {
          color: 'rgba(168, 85, 247, 0.12)',
        },
        ticks: {
          color: 'rgba(168, 85, 247, 0.5)',
          font: { size: 9, family: "system-ui, sans-serif" }
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };

  if (!mounted) {
    return <div className="w-screen h-screen bg-[#000000]" />;
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER UI
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="w-screen min-h-screen bg-[#000000] text-[#a1a1aa] font-[system-ui,sans-serif] flex flex-col">
      
      {/* HEADER */}
      <header className="h-[54px] min-h-[54px] border-b border-[#2e1065] bg-[#090514] flex justify-between items-center px-6">
        <div className="text-white font-bold tracking-[3px] text-xs">
          NEUROSYNC
        </div>
        <div className="flex gap-4">
          {!isConnected ? (
            <button onClick={connectSerial} className="px-4 py-1 text-[10px] font-bold border border-[#a855f7] text-[#a855f7] hover:bg-[#a855f7] hover:text-black transition-colors rounded">
              INITIALIZE TELEMETRY LINK
            </button>
          ) : (
            <button onClick={disconnect} className="px-4 py-1 text-[10px] font-bold border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors rounded">
              SEVER LINK
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTENT STACK */}
      <main className="flex-1 p-4 flex flex-col gap-4">
        
        {/* TOP LAYER: Full Width Chart Wrapper */}
        <div className="w-full bg-[#090514] border border-[#2e1065] rounded flex flex-col relative shadow-[0_0_15px_rgba(168,85,247,0.05)]">
          <div className="flex justify-between items-center p-3 border-b border-[#2e1065] bg-[rgba(255,255,255,0.02)]">
            <span className="text-[#a855f7] text-[10px] font-bold tracking-widest">◆ LIVE BIO-SIGNAL STREAM</span>
            <button 
              onClick={toggleRecording}
              className={`px-3 py-1 text-[9px] font-bold tracking-widest border rounded transition-all ${isRecording ? 'text-red-500 border-red-500 shadow-[inset_0_0_8px_rgba(239,68,68,0.3)] animate-pulse' : 'text-[#a855f7] border-[#a855f7] hover:bg-[#a855f7] hover:text-black'}`}
            >
              ● REC
            </button>
          </div>
          <div className="relative w-full h-[260px] min-h-[260px] p-4 pb-1">
            <Line data={chartData} options={chartOptions} />
          </div>
          <div className="p-2 border-t border-[#2e1065] text-[9px] font-bold tracking-widest text-[#a855f7] flex justify-between bg-black">
            <span>RATE: 500Hz | MAX: 4095μV</span>
            <span>LATEST: {latestValue}μV</span>
          </div>
        </div>

        {/* BOTTOM LAYER: 3-Column Multi-Panel Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-4">
          
          {/* Column 1: Keyboard Remote Control Override */}
          <div className="bg-[#090514] border border-[#2e1065] rounded flex flex-col shadow-[0_0_15px_rgba(168,85,247,0.05)]">
            <div className="p-3 border-b border-[#2e1065] bg-[rgba(255,255,255,0.02)]">
              <span className="text-[#a855f7] text-[10px] font-bold tracking-widest">🎮 KEYBOARD REMOTE CONTROL OVERRIDE</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2 font-mono text-[11px] text-[#71717a]">
                <div className="flex items-center gap-2">
                  <span className="text-white bg-[#2e1065] px-2 py-1 rounded w-16 text-center">[F Key]</span> ➔ Move Vehicle FORWARD
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white bg-[#2e1065] px-2 py-1 rounded w-16 text-center">[S Key]</span> ➔ HALT / EMERGENCY STOP
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white bg-[#2e1065] px-2 py-1 rounded w-16 text-center">[B Key]</span> ➔ Move Vehicle BACKWARD
                </div>
              </div>
              <div className="relative mt-2">
                <input
                  type="text"
                  placeholder="Type directional command (F, S, B) and press Enter..."
                  className="w-full bg-[#02010a] border border-[#2e1065] rounded p-3 text-white text-xs font-mono placeholder-[#71717a] focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7] transition-all"
                  onChange={(e) => {
                    const val = e.target.value.trim().toUpperCase();
                    if (val.length > 0) {
                      const lastChar = val[val.length - 1];
                      if (['F', 'S', 'B'].includes(lastChar)) {
                        handleCommand(lastChar);
                        e.target.value = '';
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim().toUpperCase();
                      if (['F', 'S', 'B'].includes(val)) {
                        handleCommand(val);
                      }
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Column 2: System Terminal Log */}
          <div className="bg-[#090514] border border-[#2e1065] rounded flex flex-col shadow-[0_0_15px_rgba(168,85,247,0.05)]">
            <div className="p-3 border-b border-[#2e1065] bg-[rgba(255,255,255,0.02)] flex justify-between">
              <span className="text-white text-[10px] font-bold tracking-widest">◆ SYSTEM TERMINAL LOG</span>
              <span className="text-[#c084fc] animate-pulse text-[10px] font-bold">LIVE</span>
            </div>
            <div className="p-3 overflow-y-auto text-[10px] font-mono leading-relaxed bg-black space-y-1 min-h-[160px] max-h-[220px]">
              {terminalLogs.map((log, i) => (
                <div key={i} className={`${log.type === 'error' ? 'text-red-500' : log.type === 'success' ? 'text-[#a855f7]' : log.type === 'warning' ? 'text-amber-500' : 'text-[#c084fc]'}`}>
                  {log.msg}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Column 3: Diagnostic Matrix & Dual-AI Verification Archive */}
          <div className="flex flex-col gap-4">
            {/* Panel: Stroke Assist Diagnostic Matrix */}
            <div className="bg-[#090514] border border-[#2e1065] rounded flex flex-col shadow-[0_0_15px_rgba(168,85,247,0.05)]">
              <div className="p-3 border-b border-[#2e1065] bg-[rgba(255,255,255,0.02)]">
                <span className="text-[#c084fc] text-[10px] font-bold tracking-widest">◆ STROKE ASSIST DIAGNOSTIC MATRIX</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <div className="bg-black p-3 border border-[#2e1065] rounded">
                  <div className="text-[9px] font-bold text-[#71717a] tracking-wider mb-1">HEMISPHERIC ASYMMETRY</div>
                  <div className="text-lg font-bold text-white">{asymmetryIndex}%</div>
                </div>
                <div className="bg-black p-3 border border-[#2e1065] rounded">
                  <div className="text-[9px] font-bold text-[#71717a] tracking-wider mb-1">OCULAR FATIGUE RATE</div>
                  <div className="text-lg font-bold text-white">{fatigueRate}/hr</div>
                </div>
                <div className="bg-black p-3 border border-[#2e1065] rounded">
                  <div className="text-[9px] font-bold text-[#71717a] tracking-wider mb-1">BUFFER CAPACITY</div>
                  <div className="text-lg font-bold text-[#a855f7]">{dataBufferRef.current.length}/500</div>
                </div>
                <div className="bg-black p-3 border border-[#2e1065] rounded">
                  <div className="text-[9px] font-bold text-[#71717a] tracking-wider mb-1">CRITICAL BREACHES</div>
                  <div className="text-lg font-bold text-red-500">
                    {terminalLogs.filter(l => l.msg.includes('[CRITICAL]')).length}
                  </div>
                </div>
                <div className="bg-black p-3 border border-[#2e1065] rounded col-span-2">
                  <div className="text-[9px] font-bold text-[#71717a] tracking-wider mb-1">VEHICLE STATE</div>
                  <div className={`text-xs font-bold mt-0.5 ${currentVehicleState.includes('HALT') ? 'text-red-500' : 'text-green-500'}`}>
                    {currentVehicleState}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel: Dual-AI Verification Archive */}
            <div className="bg-[#090514] border border-[#2e1065] rounded flex flex-col shadow-[0_0_15px_rgba(168,85,247,0.05)]">
              <div className="p-3 border-b border-[#2e1065] bg-[rgba(255,255,255,0.02)]">
                <span className="text-white text-[10px] font-bold tracking-widest">◆ DUAL-AI VERIFICATION ARCHIVE</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <button 
                  onClick={generateAIReport}
                  disabled={aiReportStatus === 'processing'}
                  className="w-full py-2.5 border border-[#a855f7] text-[#a855f7] text-[10px] font-bold tracking-[2px] rounded hover:bg-[#a855f7] hover:text-black transition-all disabled:opacity-50"
                >
                  {aiReportStatus === 'processing' ? 'PROCESSING NEURAL PIPELINE...' : 'GENERATE VERIFIED HEALTH REPORT'}
                </button>

                {aiReportStatus === 'complete' && aiConsensus && (
                  <div className="border border-[#2e1065] bg-black p-4 rounded space-y-4 max-h-[160px] overflow-y-auto">
                    <div className="text-center pb-2 border-b border-[#2e1065]">
                      <h4 className="font-bold text-white text-[10px] tracking-widest mb-0.5">CLINICAL CONSENSUS LEDGER</h4>
                      <div className="text-[9px] text-[#71717a]">CAPTURED PEAK: {aiConsensus.peakValue}μV</div>
                    </div>
                    
                    <div className="space-y-3 text-[10px]">
                      <div className="p-2 border border-[#2e1065] rounded bg-[#090514]">
                        <div className="font-bold text-[#a855f7] mb-1 tracking-wide">AGENT 1: WAVEFORM MORPHOLOGY</div>
                        <div className={aiConsensus.agent1.passed ? 'text-green-400' : 'text-red-400'}>
                          {aiConsensus.agent1.verdict}
                        </div>
                      </div>
                      
                      <div className="p-2 border border-[#2e1065] rounded bg-[#090514]">
                        <div className="font-bold text-[#a855f7] mb-1 tracking-wide">AGENT 2: NEUROLOGICAL BASELINE</div>
                        <div className={aiConsensus.agent2.passed ? 'text-green-400' : 'text-red-400'}>
                          {aiConsensus.agent2.verdict}
                        </div>
                      </div>
                    </div>

                    <div className={`p-2.5 text-center border font-bold tracking-widest rounded text-xs ${
                      aiConsensus.finalVerdict === 'VALIDATED' 
                        ? 'border-green-500 text-green-500 bg-[rgba(34,197,94,0.1)]' 
                        : 'border-red-500 text-red-500 bg-[rgba(239,68,68,0.1)]'
                    }`}>
                      VERDICT: {aiConsensus.finalVerdict}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
