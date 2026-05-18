import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  Headphones,
  PhoneCall,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const CALLING_API_URL =
  process.env.REACT_APP_CALLING_API_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:3000";

const API = `${CALLING_API_URL}/api`;

const initialLead = {
  first_name: "",
  phone_number: "",
  lead_id: "",
  state: "",
  lead_source: "website",
  lead_notes: "",
};

function formatNumber(value, fallback = "0") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return new Intl.NumberFormat().format(Number(value));
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "0s";
  const minutes = Math.floor(total / 60);
  const remainder = Math.round(total % 60);
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function timeLabel(value) {
  if (!value) return "Not started";
  return new Date(value).toLocaleString();
}

function StatusBadge({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  const tone =
    normalized.includes("completed") || normalized.includes("online") || normalized.includes("healthy") || normalized.includes("ok")
      ? "success"
      : normalized.includes("failed") || normalized.includes("offline") || normalized.includes("error")
        ? "danger"
        : normalized.includes("warning") || normalized.includes("pending") || normalized.includes("degraded") || normalized.includes("checking")
          ? "warning"
          : "neutral";

  return <span className={`status-badge ${tone}`}>{value || "unknown"}</span>;
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <article className="metric">
      <span className="metric-shine" />
      <div className="metric-icon">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  );
}

function LoadingRows() {
  return Array.from({ length: 4 }).map((_, index) => (
    <tr key={index}>
      <td><span className="skeleton-line wide-line" /></td>
      <td><span className="skeleton-line" /></td>
      <td><span className="skeleton-line short-line" /></td>
      <td><span className="skeleton-pill" /></td>
      <td><span className="skeleton-line short-line" /></td>
      <td><span className="skeleton-line" /></td>
    </tr>
  ));
}

const Home = () => {
  const [health, setHealth] = useState({ status: "checking", checks: {} });
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState([]);
  const [lead, setLead] = useState(initialLead);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const heroCardRef = useRef(null);

  useEffect(() => {
    const card = heroCardRef.current;
    if (!card) return;
    const layers = card.querySelectorAll('.circle-layer');

    const onMove = (e) => {
      const r = card.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      card.style.transform = `perspective(900px) rotateX(${-dy * 10}deg) rotateY(${dx * 10}deg)`;
      layers.forEach(l => {
        const d = parseFloat(l.dataset.depth);
        l.style.transform = `translate(${dx * d * 24}px, ${dy * d * 24}px)`;
      });
    };

    const onLeave = () => {
      card.style.transform = '';
      layers.forEach(l => (l.style.transform = ''));
    };

    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => {
      card.removeEventListener('mousemove', onMove);
      card.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const transferRate = useMemo(() => {
    if (!summary?.transfer_rate) return "0%";
    return `${Math.round(summary.transfer_rate * 100)}%`;
  }, [summary]);

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    setLoading(true);
    if (!quiet) {
      setNotice(null);
    }

    try {
      const [healthResponse, summaryResponse, callsResponse] = await Promise.all([
        axios.get(`${CALLING_API_URL}/health`, { validateStatus: (status) => status < 600 }),
        axios.get(`${API}/dashboard/summary`),
        axios.get(`${API}/calls?limit=12`),
      ]);

      setHealth(healthResponse.data);
      setSummary(summaryResponse.data);
      setCalls(callsResponse.data.calls || []);
      setLastUpdated(new Date());
    } catch (error) {
      setHealth({
        status: "offline",
        checks: {},
        message: error.response?.data?.error || error.message,
      });
      if (!quiet) {
        setNotice({
          type: "error",
          text: error.response?.data?.message || error.message || "Unable to reach AI calling backend.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const updateLead = (event) => {
    const { name, value } = event.target;
    setLead((current) => ({ ...current, [name]: value }));
  };

  const submitCall = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);

    try {
      const payload = {
        ...lead,
        lead_id: lead.lead_id || `web-${Date.now()}`,
      };
      const response = await axios.post(`${API}/calls/outbound`, payload);

      setNotice({
        type: "success",
        text: `Call queued successfully. Call ID: ${response.data.call_id}`,
      });
      setLead(initialLead);
      await loadDashboard({ quiet: true });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || error.response?.data?.error || error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <section className="workspace">
        <header className="site-nav">
          <div className="brand">
            <div className="brand-mark">
              <Bot size={22} aria-hidden="true" />
            </div>
            <div>
              <strong>AI Calling</strong>
              <span>Voice operations</span>
            </div>
          </div>

          <nav className="nav-list" aria-label="Primary">
            <a href="#overview">Overview</a>
            <a href="#outbound">Outbound</a>
            <a href="#calls">Calls</a>
          </nav>

          <div className="topbar-actions">
            <div className="live-chip">
              <span className="pulse-dot" />
              {health.status || "checking"}
            </div>
            <button className="icon-button" onClick={() => loadDashboard()} aria-label="Refresh dashboard">
              <RefreshCw className={loading ? "spin" : ""} size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="headline">
            <p className="eyebrow">AI conversations made clear</p>
            <h1>
              Understand every
              <span> call, lead and handoff.</span>
            </h1>
            <p>
              A behavioural-style command centre for launching outbound AI calls,
              monitoring runtime health, and turning conversations into cleaner action.
            </p>
            <span>
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Connecting to runtime"}
            </span>
          </div>

          <div className="hero-card" ref={heroCardRef} aria-label="Runtime signal">
            <div className="hero-circles">
              <div className="circle-layer layer-back" data-depth="0.15">
                <div className="circle c1" />
                <div className="circle c2" />
                <div className="circle c3" />
                <div className="circle c4" />
              </div>
              <div className="circle-layer layer-mid" data-depth="0.4">
                <div className="circle c5" />
                <div className="circle c6" />
                <div className="circle c7" />
                <div className="circle c8" />
              </div>
              <div className="circle-layer layer-front" data-depth="0.8">
                <div className="circle c9" />
                <div className="circle c10" />
                <div className="circle c11" />
              </div>
            </div>
            <div className="hero-card-content">
              <ShieldCheck size={22} aria-hidden="true" />
              <p>Runtime clarity</p>
              <strong>{health.status || "checking"}</strong>
              <small>{summary?.active_prompt ? `Prompt v${summary.active_prompt.version_number}` : "Prompt pending"}</small>
            </div>
          </div>
        </section>

        {notice ? (
          <div className={`notice ${notice.type}`}>
            {notice.type === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertCircle size={18} aria-hidden="true" />
            )}
            <span>{notice.text}</span>
          </div>
        ) : null}

        <section id="overview" className="metrics-grid" aria-label="Dashboard metrics">
          <Metric
            icon={PhoneCall}
            label="Total calls"
            value={formatNumber(summary?.total_calls)}
            hint={`${formatNumber(summary?.outbound_calls)} outbound`}
          />
          <Metric
            icon={Sparkles}
            label="Transfers"
            value={formatNumber(summary?.transfers)}
            hint={`${transferRate} transfer rate`}
          />
          <Metric
            icon={Clock3}
            label="Average duration"
            value={formatDuration(summary?.avg_duration)}
            hint={`${formatNumber(summary?.pending_reviews)} pending reviews`}
          />
          <Metric
            icon={Activity}
            label="Active calls"
            value={formatNumber(summary?.active_calls)}
            hint={summary?.active_prompt ? `Prompt v${summary.active_prompt.version_number}` : "No active prompt"}
          />
        </section>

        <div className="main-grid">
          <section id="outbound" className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Outbound dialer</p>
                <h2>Start an AI call</h2>
              </div>
              <StatusBadge value={loading ? "checking" : health.status} />
            </div>

            <form className="call-form" onSubmit={submitCall}>
              <label>
                First name
                <input
                  name="first_name"
                  value={lead.first_name}
                  onChange={updateLead}
                  placeholder="Sarah"
                />
              </label>

              <label>
                Phone number
                <input
                  name="phone_number"
                  value={lead.phone_number}
                  onChange={updateLead}
                  placeholder="+61412345678"
                  required
                />
              </label>

              <label>
                Lead ID
                <input
                  name="lead_id"
                  value={lead.lead_id}
                  onChange={updateLead}
                  placeholder="Auto-generated if empty"
                />
              </label>

              <label>
                State
                <select name="state" value={lead.state} onChange={updateLead}>
                  <option value="">Unknown</option>
                  <option value="NSW">NSW</option>
                  <option value="VIC">VIC</option>
                  <option value="QLD">QLD</option>
                  <option value="WA">WA</option>
                  <option value="SA">SA</option>
                  <option value="TAS">TAS</option>
                  <option value="ACT">ACT</option>
                  <option value="NT">NT</option>
                </select>
              </label>

              <label>
                Lead source
                <input
                  name="lead_source"
                  value={lead.lead_source}
                  onChange={updateLead}
                  placeholder="website"
                />
              </label>

              <label className="wide">
                Lead notes
                <textarea
                  name="lead_notes"
                  value={lead.lead_notes}
                  onChange={updateLead}
                  placeholder="Interested in a quote, prefers afternoon calls..."
                  rows="4"
                />
              </label>

              <button className="primary-button" disabled={submitting} type="submit">
                <Send size={17} aria-hidden="true" />
                {submitting ? "Starting call..." : "Start AI call"}
              </button>
            </form>
          </section>

          <section className="panel service-status">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Service checks</p>
                <h2>Runtime health</h2>
              </div>
            </div>

            {["database", "twilio", "elevenlabs"].map((key) => (
              <div className="check-row" key={key}>
                <span>{key}</span>
                <StatusBadge value={health.checks?.[key]?.status || "unknown"} />
              </div>
            ))}

            <div className="voice-visualizer" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="api-url">
              <span>API URL</span>
              <code>{CALLING_API_URL}</code>
            </div>
          </section>
        </div>

        <section id="calls" className="panel calls-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Calls</h2>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows />
                ) : calls.length ? (
                  calls.map((call) => (
                    <tr key={call.call_id}>
                      <td>{call.additional_data?.first_name || call.lead_id || "Unknown"}</td>
                      <td>{call.phone_number || "Unknown"}</td>
                      <td>{call.call_type}</td>
                      <td>
                        <StatusBadge value={call.call_status || call.manual_review_status} />
                      </td>
                      <td>{formatDuration(call.call_duration_seconds)}</td>
                      <td>{timeLabel(call.initiated_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      No calls yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
