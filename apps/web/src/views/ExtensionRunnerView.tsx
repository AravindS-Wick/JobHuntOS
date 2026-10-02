import React, { useState } from 'react';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';

export const ExtensionRunnerView: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Extension Manifest V3 background service worker active.`,
    `[${new Date().toLocaleTimeString()}] WebSocket connected to local Fastify bridge gateway (Port 8080).`,
    `[${new Date().toLocaleTimeString()}] Residential session fingerprint: Chrome 124.0 (Windows NT 10.0; Win64).`,
  ]);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isCaptchaModalOpen, setIsCaptchaModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('Awaiting Pub/Sub...');

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const handleTriggerAutofill = () => {
    addLog('Initiating Gaussian delay form auto-fill (μ=4.5s, σ=1.2s)...');
    setIsHighlighting(true);

    setTimeout(() => {
      setIsHighlighting(false);
      addLog('Candidate fields successfully injected into target DOM!');
      showToast('Extension auto-fill completed without DOM errors!', 'success', 'fa-circle-check');
    }, 1500);
  };

  const handleSimulateCaptcha = () => {
    addLog('Cloudflare Turnstile CAPTCHA detected on Workday registration form!');
    addLog('Human Gate triggered: Agent paused at checkpoint.');
    setIsCaptchaModalOpen(true);
  };

  const handleResolveCaptcha = () => {
    setIsCaptchaModalOpen(false);
    addLog('Human Gate checkpoint cleared by user. Resuming automated workflow.');
    showToast('CAPTCHA solved! Resuming application queue.', 'success', 'fa-shield-halved');
  };

  const handleSimulateOtp = () => {
    addLog('Google Cloud Pub/Sub push notification received: Workday verification email.');
    addLog('Extracted 6-digit OTP code: 849201');
    setOtpValue('849201 (VERIFIED)');
    addLog('Injected OTP into Workday confirmation field.');
    showToast('Injected Workday OTP: 849201', 'cyan', 'fa-envelope-open-text');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-brands fa-chrome text-accent-emerald"></i> Manifest V3 Extension Debugger & DOM Bridge
          </h2>
          <p className="text-xs text-gray-400">
            PRD Module D: Client-side residential execution, human-in-the-loop checkpoint gates, and DOM field injection.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 text-xs font-mono font-bold">
          Bridge: CONNECTED (Port 8080)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Task Controls */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
          <h3 className="font-bold text-xs text-gray-200 border-b border-gray-800 pb-2">Manual Task Controls</h3>

          <div className="space-y-2.5">
            <button
              onClick={handleTriggerAutofill}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg glow-effect"
            >
              <i className="fa-solid fa-play"></i> Trigger DOM Auto-Fill Sequence
            </button>
            <button
              onClick={handleSimulateCaptcha}
              className="w-full bg-dark-card border border-accent-amber/40 hover:border-accent-amber text-amber-300 text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 font-semibold"
            >
              <i className="fa-solid fa-shield-cat"></i> Simulate Turnstile CAPTCHA Gate
            </button>
            <button
              onClick={handleSimulateOtp}
              className="w-full bg-dark-card border border-accent-cyan/40 hover:border-accent-cyan text-cyan-300 text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 font-semibold"
            >
              <i className="fa-solid fa-envelope-open-text"></i> Simulate Gmail OTP Injection
            </button>
          </div>

          <div className="p-3.5 bg-dark-card rounded-xl border border-gray-800 text-[11px] space-y-1.5 text-gray-400 font-mono">
            <p className="text-gray-200 font-bold border-b border-gray-800 pb-1">Residential Session Telemetry</p>
            <p>• IP: Local ISP Residential (0 Flags)</p>
            <p>• TLS Fingerprint: Chrome 124.0.0</p>
            <p>• Gaussian Jitter: μ=4.5s (σ=1.2s)</p>
            <p>• Active Tab: Stripe Careers Greenhouse Form</p>
          </div>
        </div>

        {/* Right Column: DOM Inspector & Console Log */}
        <div className="lg:col-span-2 space-y-4">
          {/* Visual Target DOM Inspector */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs text-gray-200">Target Form DOM Field Inspector Simulation</h3>
              <span className="text-[10px] text-gray-400 font-mono">Portal: Greenhouse / Workday ATS</span>
            </div>

            <div className="space-y-2 text-xs font-mono bg-black/60 p-4 rounded-xl border border-gray-800">
              <div
                className={`p-2.5 rounded-lg border border-gray-800 flex items-center justify-between transition duration-300 ${
                  isHighlighting ? 'dom-highlight' : 'bg-dark-card'
                }`}
              >
                <span className="text-gray-400">&lt;input id="legal_first_name" /&gt;</span>
                <span className="text-brand-300 font-bold">Aravindhan</span>
              </div>
              <div
                className={`p-2.5 rounded-lg border border-gray-800 flex items-center justify-between transition duration-300 ${
                  isHighlighting ? 'dom-highlight' : 'bg-dark-card'
                }`}
              >
                <span className="text-gray-400">&lt;input id="email_address" /&gt;</span>
                <span className="text-brand-300 font-bold">aravindhan.dev@gmail.com</span>
              </div>
              <div
                className={`p-2.5 rounded-lg border border-gray-800 flex items-center justify-between transition duration-300 ${
                  isHighlighting ? 'dom-highlight' : 'bg-dark-card'
                }`}
              >
                <span className="text-gray-400">&lt;input id="workday_otp_code" /&gt;</span>
                <span className="text-accent-amber font-bold">{otpValue}</span>
              </div>
            </div>
          </div>

          {/* Execution Log */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs text-gray-200 flex items-center gap-1.5">
                <i className="fa-solid fa-terminal text-accent-emerald"></i> Live Extension Execution Log
              </h3>
              <button
                onClick={() => setLogs([`[${new Date().toLocaleTimeString()}] Logs cleared.`])}
                className="text-[10px] text-gray-400 hover:text-gray-200"
              >
                Clear
              </button>
            </div>
            <div className="bg-black/80 rounded-xl p-3.5 font-mono text-[11px] text-emerald-400 h-40 overflow-y-auto custom-scrollbar space-y-1">
              {logs.map((log, idx) => (
                <p key={idx} className="leading-relaxed">
                  {log}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Human Gate CAPTCHA Modal */}
      <Modal
        isOpen={isCaptchaModalOpen}
        onClose={() => setIsCaptchaModalOpen(false)}
        title="Human Gate Checkpoint — CAPTCHA Detected"
        subtitle="PRD §5.4 D4: Solve the 10-second human verification gate to resume autonomous submission"
        icon="fa-shield-halved"
        iconColor="text-amber-400"
      >
        <div className="space-y-4 text-xs text-gray-300">
          <p>
            The portal is requesting an interactive verification challenge. In adherence with our zero-ToS-violation
            policy, JobHunt OS pauses at this checkpoint and hands control to you.
          </p>

          <div className="p-6 bg-dark-card rounded-xl border border-accent-amber/40 flex flex-col items-center justify-center space-y-3">
            <i className="fa-solid fa-shield-cat text-4xl text-accent-amber animate-pulse-subtle"></i>
            <span className="font-bold text-sm text-gray-100">Cloudflare Turnstile Verification</span>
            <button
              onClick={handleResolveCaptcha}
              className="px-6 py-2.5 rounded-xl bg-accent-emerald hover:bg-emerald-400 text-black font-bold text-xs transition shadow-lg glow-emerald"
            >
              Verify Checkpoint & Resume
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
