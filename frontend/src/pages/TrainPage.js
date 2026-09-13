import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Cpu,
  Play,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Info,
  Sliders,
  Terminal,
  Activity,
  Award,
  BarChart3,
  Copy,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { useTrain } from '../context/TrainContext';
import './TrainPage.css';

export default function TrainPage() {
  const { trainStatus, startTraining, resetTraining, refreshStatus } = useTrain();

  const [activeModule, setActiveModule] = useState('eye');
  const [modelStatus, setModelStatus] = useState(null);
  const [stats, setStats] = useState({});
  const [diseases, setDiseases] = useState([]);
  
  // Hyperparameter Settings
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(16);
  const [learningRate, setLearningRate] = useState(0.0001);

  const loadData = async () => {
    try {
      const [sRes, dsRes, dRes] = await Promise.all([
        axios.get('/api/model/status'),
        axios.get('/api/dataset/stats'),
        axios.get('/api/diseases')
      ]);
      setModelStatus(sRes.data);
      setStats(dsRes.data);
      setDiseases(dRes.data.diseases || []);
    } catch (err) {
      console.error('Error loading training info:', err);
    }
  };

  useEffect(() => {
    loadData();
    refreshStatus();
  }, [refreshStatus]);

  const currentModuleState = trainStatus[activeModule] || {
    status: 'idle',
    progress: 0,
    stage: 'Idle',
    message: '',
    logs: [],
    result: null,
    error: null
  };

  const isCurrentTraining = currentModuleState.status === 'running';

  // Diseases for the currently selected module
  const moduleDiseases = diseases.filter(d => d.module === activeModule);
  const readyClasses = moduleDiseases.filter(d => (stats[d.id] || 0) >= 3);
  const canTrain = readyClasses.length >= 2;

  const totalImagesInModule = moduleDiseases.reduce((acc, d) => acc + (stats[d.id] || 0), 0);

  const handleStartTrain = () => {
    if (!canTrain) {
      toast.error(`Need at least 2 classes with 3+ images in ${activeModule.toUpperCase()} module`);
      return;
    }
    startTraining(activeModule, {
      epochs,
      batch_size: batchSize,
      learning_rate: learningRate
    });
  };

  const copyLogs = () => {
    const text = currentModuleState.logs.join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Logs copied to clipboard!');
  };

  // Stage steps pipeline
  const STAGES = [
    { key: 'Preprocessing', label: 'DIP Preprocessing' },
    { key: 'Phase 1: Transfer', label: 'Phase 1: Transfer' },
    { key: 'Phase 2: Fine-Tuning', label: 'Phase 2: Fine-Tuning' },
    { key: 'Evaluating', label: 'Model Evaluation' },
    { key: 'Completed', label: 'Complete' }
  ];

  const getStageIndex = (stage) => {
    if (!stage) return -1;
    if (stage.includes('Preprocessing') || stage.includes('Scanning') || stage.includes('Initializing')) return 0;
    if (stage.includes('Phase 1')) return 1;
    if (stage.includes('Phase 2')) return 2;
    if (stage.includes('Evaluating') || stage.includes('Saving')) return 3;
    if (stage.includes('Completed')) return 4;
    return 1;
  };

  const currentStageIndex = getStageIndex(currentModuleState.stage);

  return (
    <div className="page train-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Model Trainer & Evaluation Studio</h1>
          <p className="page-subtitle">
            Train deep learning transfer-learning models with customizable hyperparameters and real-time progress tracking.
          </p>
        </div>
      </div>

      {/* Module Selector Segmented Tabs */}
      <div className="module-tabs-card card">
        <div className="module-tabs-inner">
          <button
            className={`module-tab-btn ${activeModule === 'eye' ? 'active' : ''}`}
            onClick={() => setActiveModule('eye')}
          >
            <span className="module-tab-icon">👁️</span>
            <div className="module-tab-text">
              <span className="module-tab-title">Eye Classification Model</span>
              <span className="module-tab-subtitle">
                {trainStatus.eye.status === 'running' ? `⚡ Training in progress (${trainStatus.eye.progress}%)` : modelStatus?.eye?.trained ? '✓ Trained & Ready' : 'Untrained'}
              </span>
            </div>
            {trainStatus.eye.status === 'running' && <span className="tab-pulsing-badge">{trainStatus.eye.progress}%</span>}
          </button>

          <button
            className={`module-tab-btn ${activeModule === 'wing' ? 'active' : ''}`}
            onClick={() => setActiveModule('wing')}
          >
            <span className="module-tab-icon">🪶</span>
            <div className="module-tab-text">
              <span className="module-tab-title">Wing & Posture Model</span>
              <span className="module-tab-subtitle">
                {trainStatus.wing.status === 'running' ? `⚡ Training in progress (${trainStatus.wing.progress}%)` : modelStatus?.wing?.trained ? '✓ Trained & Ready' : 'Untrained'}
              </span>
            </div>
            {trainStatus.wing.status === 'running' && <span className="tab-pulsing-badge">{trainStatus.wing.progress}%</span>}
          </button>
        </div>
      </div>

      <div className="train-grid-layout">
        {/* Left Column: Model Config, Class Balance, & Trigger */}
        <div className="train-left-col">
          {/* Active Model Status Card */}
          <div className="card model-status-card">
            <div className="card-title-row">
              <span className="card-title">
                {activeModule === 'eye' ? '👁️ Eye Model Status' : '🪶 Wing Model Status'}
              </span>
              <button className="btn btn-secondary icon-btn-sm" onClick={loadData} title="Refresh status">
                <RefreshCw size={13} />
              </button>
            </div>

            {modelStatus?.[activeModule]?.trained ? (
              <div className="status-trained-banner">
                <CheckCircle size={24} color="#4ade80" />
                <div>
                  <div className="status-label-good">Model Trained & Operational</div>
                  <div className="status-classes-text">
                    Detecting {Object.keys(modelStatus[activeModule].classes || {}).length} classes:{' '}
                    <strong>{Object.values(modelStatus[activeModule].classes || {}).join(', ')}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="status-untrained-banner">
                <AlertCircle size={24} color="#fbbf24" />
                <div>
                  <div className="status-label-warn">Model Not Trained Yet</div>
                  <div className="status-classes-text">
                    Ensure each class has at least 3 images, then click Start Training.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Class Distribution Visualizer */}
          <div className="card class-balance-card">
            <div className="card-title-row">
              <span className="card-title">
                <BarChart3 size={15} color="#4ade80" /> Class Balance ({activeModule.toUpperCase()})
              </span>
              <span className="total-imgs-pill">{totalImagesInModule} Total Images</span>
            </div>

            <div className="class-balance-list">
              {moduleDiseases.map(d => {
                const count = stats[d.id] || 0;
                const isReady = count >= 3;
                const pct = totalImagesInModule > 0 ? ((count / totalImagesInModule) * 100).toFixed(0) : 0;
                return (
                  <div key={d.id} className="balance-item">
                    <div className="balance-info-row">
                      <span className="balance-dot" style={{ background: d.color }} />
                      <span className="balance-name">{d.name}</span>
                      <span className="balance-count-pill" style={{ color: isReady ? '#4ade80' : '#f87171' }}>
                        {count} img ({pct}%)
                      </span>
                      <span className={`ready-tag ${isReady ? 'ready' : 'need-more'}`}>
                        {isReady ? '✓ Ready' : 'Need 3+'}
                      </span>
                    </div>
                    <div className="balance-bar-bg">
                      <div
                        className="balance-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.max(4, pct))}%`,
                          background: d.color || '#4ade80'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {!canTrain && (
              <div className="balance-warning animate-in">
                <AlertCircle size={14} color="#fbbf24" />
                <span>
                  At least 2 classes must have 3+ images before training can begin. Please upload more dataset images.
                </span>
              </div>
            )}
          </div>

          {/* Hyperparameters Controls */}
          <div className="card hyperparams-card">
            <div className="card-title-row">
              <span className="card-title">
                <Sliders size={15} color="#60a5fa" /> Hyperparameters
              </span>
              <span className="param-badge">MobileNetV2 Transfer</span>
            </div>

            <div className="params-grid">
              <div className="param-item">
                <label>Training Epochs:</label>
                <div className="param-btn-group">
                  {[10, 20, 30].map(val => (
                    <button
                      key={val}
                      type="button"
                      className={`param-chip ${epochs === val ? 'param-chip-active' : ''}`}
                      onClick={() => setEpochs(val)}
                      disabled={isCurrentTraining}
                    >
                      {val} {val === 10 ? '(Fast)' : val === 20 ? '(Balanced)' : '(Deep)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="param-item">
                <label>Batch Size:</label>
                <div className="param-btn-group">
                  {[8, 16, 32].map(val => (
                    <button
                      key={val}
                      type="button"
                      className={`param-chip ${batchSize === val ? 'param-chip-active' : ''}`}
                      onClick={() => setBatchSize(val)}
                      disabled={isCurrentTraining}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="param-item">
                <label>Learning Rate:</label>
                <div className="param-btn-group">
                  {[0.001, 0.0001, 0.00001].map(val => (
                    <button
                      key={val}
                      type="button"
                      className={`param-chip ${learningRate === val ? 'param-chip-active' : ''}`}
                      onClick={() => setLearningRate(val)}
                      disabled={isCurrentTraining}
                    >
                      {val.toExponential()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Train Trigger Button */}
            <div className="train-trigger-row">
              <button
                className="btn btn-primary start-train-btn"
                onClick={handleStartTrain}
                disabled={isCurrentTraining || !canTrain}
              >
                {isCurrentTraining ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    Training {activeModule.toUpperCase()} in Background ({currentModuleState.progress}%)...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Start {activeModule === 'eye' ? 'Eye' : 'Wing'} Model Training
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Progress, Pipeline Stages, Terminal Logs, Evaluation Results */}
        <div className="train-right-col">
          {/* Live Progress Card */}
          <div className="card live-progress-card">
            <div className="card-title-row">
              <div className="progress-title-wrap">
                <Activity size={16} color={isCurrentTraining ? '#4ade80' : '#94a3b8'} className={isCurrentTraining ? 'pulse-icon' : ''} />
                <span className="card-title">Training Execution Pipeline</span>
              </div>
              <span className={`status-pill status-pill-${currentModuleState.status}`}>
                {currentModuleState.status.toUpperCase()}
              </span>
            </div>

            {/* Pipeline Stage Steps */}
            <div className="pipeline-steps">
              {STAGES.map((s, idx) => {
                const isPassed = currentStageIndex > idx || currentModuleState.status === 'completed';
                const isCurrent = currentStageIndex === idx && currentModuleState.status === 'running';
                return (
                  <div
                    key={s.key}
                    className={`pipeline-step ${isPassed ? 'step-passed' : ''} ${isCurrent ? 'step-current' : ''}`}
                  >
                    <div className="step-circle">
                      {isPassed ? '✓' : idx + 1}
                    </div>
                    <span className="step-label">{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Animated Progress Bar */}
            <div className="progress-bar-container">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${currentModuleState.progress}%` }}
                />
              </div>
              <div className="progress-stats-row">
                <span className="stage-msg">
                  {currentModuleState.message || (isCurrentTraining ? 'Processing...' : 'Idle — ready to train')}
                </span>
                <span className="progress-pct">{currentModuleState.progress}%</span>
              </div>
            </div>

            {currentModuleState.error && (
              <div className="train-error-box animate-in">
                <AlertCircle size={16} color="#f87171" />
                <span>Error: {currentModuleState.error}</span>
              </div>
            )}
          </div>

          {/* Model Evaluation Metrics Card (Shown if result available) */}
          {currentModuleState.result && (
            <div className="card evaluation-card animate-in">
              <div className="card-title-row">
                <span className="card-title">
                  <Award size={16} color="#fbbf24" /> Evaluation Metrics ({currentModuleState.result.module?.toUpperCase()})
                </span>
                <span className="eval-success-tag">Validated on Test Partition</span>
              </div>

              <div className="metrics-summary-grid">
                <div className="metric-box">
                  <span className="metric-val text-green">{currentModuleState.result.train_accuracy}%</span>
                  <span className="metric-lbl">Train Accuracy</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val text-blue">
                    {currentModuleState.result.val_accuracy != null ? `${currentModuleState.result.val_accuracy}%` : 'N/A'}
                  </span>
                  <span className="metric-lbl">Val Accuracy</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val text-amber">
                    {currentModuleState.result.precision != null ? `${currentModuleState.result.precision}%` : '—'}
                  </span>
                  <span className="metric-lbl">Precision</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val text-purple">
                    {currentModuleState.result.f1_score != null ? `${currentModuleState.result.f1_score}%` : '—'}
                  </span>
                  <span className="metric-lbl">F1-Score</span>
                </div>
              </div>

              {/* Confusion Matrix */}
              {currentModuleState.result.confusion_matrix && (
                <div className="cm-wrapper">
                  <div className="cm-title">Confusion Matrix (Actual vs Predicted)</div>
                  <div className="cm-table-responsive">
                    <table className="cm-table">
                      <thead>
                        <tr>
                          <th className="cm-th-corner">Actual \ Pred</th>
                          {currentModuleState.result.classes_trained?.map((cls, idx) => (
                            <th key={idx} className="cm-th-col">
                              {cls.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentModuleState.result.confusion_matrix.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td className="cm-th-row">
                              {currentModuleState.result.classes_trained?.[rIdx]?.replace(/_/g, ' ') || `Class ${rIdx}`}
                            </td>
                            {row.map((val, cIdx) => {
                              const isDiag = rIdx === cIdx;
                              const isErr = !isDiag && val > 0;
                              return (
                                <td
                                  key={cIdx}
                                  className={`cm-td ${isDiag ? 'cm-diag' : isErr ? 'cm-err' : 'cm-zero'}`}
                                >
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Classification Report */}
              {currentModuleState.result.classification_report && (
                <div className="clf-report-wrap">
                  <div className="clf-report-title">Classification Report Breakdown</div>
                  <pre className="clf-report-pre">
                    <code>{currentModuleState.result.classification_report}</code>
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Terminal Console Log */}
          <div className="card log-console-card">
            <div className="card-title-row">
              <div className="terminal-title-wrap">
                <Terminal size={15} color="#4ade80" />
                <span className="card-title">Live Training Console</span>
              </div>
              <div className="log-actions">
                {currentModuleState.logs?.length > 0 && (
                  <>
                    <button className="btn btn-secondary icon-btn-sm" onClick={copyLogs} title="Copy Logs">
                      <Copy size={13} /> Copy
                    </button>
                    {!isCurrentTraining && (
                      <button
                        className="btn btn-secondary icon-btn-sm"
                        onClick={() => resetTraining(activeModule)}
                        title="Reset Training State"
                      >
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="terminal-screen">
              {currentModuleState.logs?.length === 0 ? (
                <div className="terminal-empty">
                  Console idle. Press "Start Training" to begin streaming real-time MobileNetV2 training logs.
                </div>
              ) : (
                currentModuleState.logs.map((line, idx) => (
                  <div key={idx} className="terminal-line">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
