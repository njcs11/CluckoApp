import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Cpu, Play, CheckCircle, AlertCircle, RefreshCw, Info } from 'lucide-react';
import './TrainPage.css';

export default function TrainPage() {
  const [modelStatus, setModelStatus] = useState(null);
  const [stats, setStats] = useState({});
  const [diseases, setDiseases] = useState([]);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState(null);
  const [log, setLog] = useState([]);

  const loadStatus = async () => {
    const [s, ds, d] = await Promise.all([
      axios.get('/api/model/status'),
      axios.get('/api/dataset/stats'),
      axios.get('/api/diseases')
    ]);
    setModelStatus(s.data);
    setStats(ds.data);
    setDiseases(d.data.diseases);
  };

  useEffect(() => { loadStatus(); }, []);

  const addLog = (msg) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const train = async () => {
    setTraining(true);
    setTrainResult(null);
    addLog('Starting model training...');
    addLog('Loading MobileNetV2 base model...');
    addLog('Preprocessing dataset images...');
    try {
      const { data } = await axios.post('/api/train');
      setTrainResult(data);
      if (data.success) {
        addLog(`✅ Training complete! Accuracy: ${data.train_accuracy}%`);
        if (data.val_accuracy) addLog(`📊 Validation accuracy: ${data.val_accuracy}%`);
        addLog(`🧠 Classes trained: ${data.classes_trained?.join(', ')}`);
        if (data.skipped?.length) addLog(`⚠️ Skipped: ${data.skipped.join('; ')}`);
        toast.success('Model trained successfully!');
        loadStatus();
      } else {
        addLog(`❌ Training failed: ${data.error}`);
        toast.error(data.error);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Training error';
      addLog(`❌ Error: ${msg}`);
      toast.error(msg);
    } finally {
      setTraining(false);
    }
  };

  const totalImages = Object.values(stats).reduce((a, b) => a + b, 0);
  const readyClasses = Object.entries(stats).filter(([,c]) => c >= 3).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Train Model</h1>
        <p className="page-subtitle">Train the CNN on your uploaded datasets. The model learns to detect and flag diseases.</p>
      </div>

      <div className="train-grid">
        <div className="left-col">
          {/* Model Status */}
          <div className="card status-card">
            <div className="card-title">Model Status</div>
            {modelStatus?.trained ? (
              <div className="status-trained">
                <CheckCircle size={20} color="#4ade80" />
                <div>
                  <div className="status-label-good">Model Trained & Ready</div>
                  <div className="status-classes">
                    Detecting: {modelStatus.classes?.length || 0} classes
                    {modelStatus.classes && (
                      <span style={{color:'#4a6a4a'}}> — {Object.values(modelStatus.classes).join(', ')}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="status-untrained">
                <AlertCircle size={20} color="#fbbf24" />
                <div>
                  <div className="status-label-warn">No Model Trained</div>
                  <div className="status-classes">Upload datasets then click Train</div>
                </div>
              </div>
            )}
          </div>

          {/* Dataset Summary */}
          <div className="card">
            <div className="card-title">Dataset Summary</div>
            <div className="summary-stats">
              <div className="summary-stat">
                <div className="summary-num">{totalImages}</div>
                <div className="summary-lbl">Total Images</div>
              </div>
              <div className="summary-stat">
                <div className="summary-num" style={{color: readyClasses >= 2 ? '#4ade80' : '#fbbf24'}}>{readyClasses}</div>
                <div className="summary-lbl">Ready Classes</div>
              </div>
              <div className="summary-stat">
                <div className="summary-num">{diseases.length}</div>
                <div className="summary-lbl">Total Classes</div>
              </div>
            </div>

            <div className="dataset-breakdown">
              {diseases.map(d => {
                const count = stats[d.id] || 0;
                const ready = count >= 3;
                return (
                  <div key={d.id} className="breakdown-row">
                    <span className="breakdown-dot" style={{background: d.color}} />
                    <span className="breakdown-name">{d.name}</span>
                    <span className="breakdown-count" style={{color: count === 0 ? '#f87171' : count < 20 ? '#fbbf24' : '#4ade80'}}>
                      {count} img
                    </span>
                    <span className={`tag ${ready ? 'tag-green' : 'tag-red'}`}>{ready ? 'ready' : 'need more'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Train Button */}
          <div className="card train-action-card">
            <div className="info-box">
              <Info size={14} color="#60a5fa" />
              <span>Requires ≥2 disease classes with ≥3 images each. More images = better accuracy. Training may take a few minutes.</span>
            </div>
            <button className="btn btn-primary train-btn" onClick={train} disabled={training || readyClasses < 2}>
              {training
                ? <><RefreshCw size={16} className="spin" /> Training CNN...</>
                : <><Play size={16} /> Start Training</>
              }
            </button>
            {readyClasses < 2 && (
              <p className="train-warn">⚠️ Upload images to at least 2 disease classes first</p>
            )}
          </div>

          {/* Train Result */}
          {trainResult && (
            <div className={`card result-card animate-in ${trainResult.success ? 'result-success' : 'result-fail'}`}>
              <div className="card-title">{trainResult.success ? '✅ Training Result' : '❌ Training Failed'}</div>
              {trainResult.success ? (
                <>
                  <div className="result-metrics">
                    <div className="metric">
                      <span className="metric-num">{trainResult.train_accuracy}%</span>
                      <span className="metric-lbl">Train Accuracy</span>
                    </div>
                    {trainResult.val_accuracy && (
                      <div className="metric">
                        <span className="metric-num">{trainResult.val_accuracy}%</span>
                        <span className="metric-lbl">Val Accuracy</span>
                      </div>
                    )}
                    <div className="metric">
                      <span className="metric-num">{trainResult.total_images}</span>
                      <span className="metric-lbl">Images Used</span>
                    </div>
                  </div>
                  {trainResult.skipped?.length > 0 && (
                    <div className="skip-warn">
                      ⚠️ Skipped: {trainResult.skipped.join(' · ')}
                    </div>
                  )}
                </>
              ) : (
                <p style={{color:'#f87171', fontSize:14}}>{trainResult.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Training Log */}
        <div className="card log-card">
          <div className="card-title">
            <span>Training Log</span>
            {log.length > 0 && (
              <button className="btn btn-secondary" style={{padding:'4px 10px', fontSize:12}} onClick={() => setLog([])}>
                Clear
              </button>
            )}
          </div>
          <div className="log-output">
            {log.length === 0 ? (
              <div className="log-empty">No log entries yet. Start training to see output.</div>
            ) : (
              log.map((l, i) => <div key={i} className="log-line">{l}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
