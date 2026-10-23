import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, Loader, Upload, Eye, Sparkles, X, ShieldAlert } from 'lucide-react';
import { DynamicModuleIcon, CluckoBrandBadge, EyeModuleIcon, WingModuleIcon } from '../components/icons';
import { useDetect } from '../context/DetectContext';
import './DetectPage.css';

export default function DetectPage() {
  const webcamRef = useRef(null);
  const fileRef = useRef(null);
  const [modules, setModules] = useState([]);

  useEffect(() => {
    axios.get('/api/modules')
      .then(res => setModules(res.data.modules || []))
      .catch(() => {});
  }, []);

  const {
    capturedImage,
    setCapturedImage,
    result,
    setResult,
    loading,
    camError,
    setCamError,
    scanModule,
    setScanModule,
    gradcamLoading,
    gradcamData,
    setGradcamData,
    analyze,
    handleViewGradcam,
    resetDetection
  } = useDetect();

  const compressImage = (base64Str, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const capture = useCallback(async () => {
    const rawImg = webcamRef.current?.getScreenshot();
    if (rawImg) {
      const compressed = await compressImage(rawImg);
      setCapturedImage(compressed);
      setResult(null);
      setGradcamData(null);
    }
  }, [setCapturedImage, setResult, setGradcamData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressImage(ev.target.result);
      setCapturedImage(compressed);
      setResult(null);
      setGradcamData(null);
    };
    reader.readAsDataURL(file);
  };

  const getSeverityClass = (s) => {
    const map = { none: 'severity-none', moderate: 'severity-moderate', high: 'severity-high', critical: 'severity-critical' };
    return map[s] || '';
  };

  return (
    <div className="page detect-page">
      <div className="page-header">
        <h1 className="page-title">Disease Detection</h1>
        <p className="page-subtitle">Capture or upload a chicken image to detect early signs of disease</p>
      </div>

      <div className="detect-grid">
        {/* Camera Panel */}
        <div className="card camera-panel">
          <div className="card-title camera-title-row">
            <span>Camera / Image Input</span>
            <div className="module-pill-group">
              {modules.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`mod-pill ${scanModule === m.id ? 'active' : ''}`}
                  onClick={() => setScanModule(m.id)}
                  title={`Target ${m.name} diseases`}
                >
                  <DynamicModuleIcon module={m.id} icon={m.icon} size={13} style={{ marginRight: 4 }} /> {m.name}
                </button>
              ))}
            </div>
          </div>

          {!capturedImage ? (
            <div className="camera-view">
              {camError ? (
                <div className="cam-error">
                  <AlertTriangle size={32} color="#fbbf24" />
                  <p>Camera unavailable</p>
                  <p className="cam-error-sub">Use the upload button below</p>
                </div>
              ) : (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                  onUserMediaError={() => setCamError(true)}
                  className="webcam-feed"
                />
              )}
              <div className="camera-overlay">
                <div className="scan-corners">
                  <div className="corner tl" /><div className="corner tr" />
                  <div className="corner bl" /><div className="corner br" />
                </div>
              </div>
            </div>
          ) : (
            <div className="camera-view">
              <img src={capturedImage} alt="Captured" className="captured-img" />
            </div>
          )}

          <div className="camera-actions">
            {!capturedImage ? (
              <>
                <button className="btn btn-primary" onClick={capture} disabled={camError}>
                  <Camera size={16} /> Capture
                </button>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} /> Upload Image
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFileUpload} />
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => analyze()} disabled={loading}>
                  {loading ? <Loader size={16} className="spin" /> : <CheckCircle size={16} />}
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
                <button className="btn btn-secondary" onClick={() => resetDetection()}>
                  <RefreshCw size={16} /> Retake
                </button>
              </>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="results-panel">
          {!result && !loading && (
            <div className="card detect-hero-stage">
              <div className="detect-hero-badge-wrap">
                <CluckoBrandBadge size={54} iconSize={32} glow={true} />
              </div>
              <h2 className="detect-hero-title">Where Intelligence Begins</h2>
              <p className="detect-hero-sub">
                Capture or upload an image to run dual-head neural diagnostics with explainable Grad-CAM heatmaps
              </p>

              <div className="detect-feature-cards">
                <div className="detect-feature-card">
                  <div className="feature-card-header">
                    <EyeModuleIcon size={16} color="#22c55e" />
                    <span className="feature-card-title">Eye Pathology Head</span>
                  </div>
                  <p className="feature-card-desc">Specialized in Infectious Coryza and Fowl Pox</p>
                </div>

                <div className="detect-feature-card">
                  <div className="feature-card-header">
                    <WingModuleIcon size={16} color="#22c55e" />
                    <span className="feature-card-title">Wing & Posture Head</span>
                  </div>
                  <p className="feature-card-desc">Detects Newcastle disease, wing droop, and posture anomalies</p>
                </div>

                <div className="detect-feature-card">
                  <div className="feature-card-header">
                    <Sparkles size={16} color="#22c55e" />
                    <span className="feature-card-title">Grad-CAM Heatmaps</span>
                  </div>
                  <p className="feature-card-desc">Generates visual saliency attention maps highlighting infection clusters</p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="card result-placeholder">
              <CluckoBrandBadge size={46} iconSize={26} glow={true} pulse={true} />
              <p className="placeholder-text" style={{ color: 'var(--accent-green-bright)', fontWeight: 600 }}>
                Running MobileNetV2 Neural Analysis...
              </p>
            </div>
          )}

          {result && (
            <div className="results animate-in">
              {/* Rejection Card */}
              {result.rejected && (
                <div className="card rejection-card">
                  <div className="rejection-icon">
                    <ShieldAlert size={36} color="#ef4444" />
                  </div>
                  <div className="rejection-title">Not a Chicken</div>
                  <p className="rejection-message">{result.message}</p>
                  <div className="rejection-reason">{result.rejection_reason}</div>
                  <button className="btn btn-secondary" style={{marginTop:12}} onClick={resetDetection}>
                    Try Again
                  </button>
                </div>
              )}

              {/* Top Disease Flag */}
              {!result.rejected && (
                <>
                  <div className="card disease-flag" style={{borderColor: result.top_prediction.color}}>
                    <div className="flag-header">
                      <span className="flag-label">FLAGGED DISEASE</span>
                      <span className={`tag ${result.top_prediction.severity === 'none' ? 'tag-green' : result.top_prediction.severity === 'moderate' ? 'tag-amber' : 'tag-red'}`}>
                        {result.top_prediction.severity?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </div>
                    <div className="flag-disease-name" style={{color: result.top_prediction.color}}>
                      {result.flagged_disease}
                    </div>
                    <div className="flag-confidence">
                      <span className="conf-label">Confidence</span>
                      <div className="conf-bar-wrap">
                        <div className="conf-bar" style={{width: `${result.top_prediction.confidence}%`, background: result.top_prediction.color}} />
                      </div>
                      <span className="conf-value">{result.top_prediction.confidence}%</span>
                      <span className={`tag ${result.confidence_level === 'High' ? 'tag-green' : result.confidence_level === 'Moderate' ? 'tag-amber' : 'tag-red'}`}>
                        {result.confidence_level}
                      </span>
                    </div>
                    <p className="flag-desc">{result.top_prediction.description}</p>
                  </div>

                  {/* Grad-CAM Viewer (Task 6) */}
                  <div className="gradcam-action-box">
                    <button
                      className="btn btn-gradcam"
                      onClick={handleViewGradcam}
                      disabled={gradcamLoading}
                    >
                      {gradcamLoading ? (
                        <><Loader size={16} className="spin" /> Computing AI Focus Heatmap...</>
                      ) : (
                        <><Eye size={16} /> View AI Focus (Grad-CAM)</>
                      )}
                    </button>
                  </div>

                  {gradcamData && (
                    <div className="card gradcam-card animate-in">
                      <div className="gradcam-header">
                        <div className="gradcam-title-wrap">
                          <Sparkles size={16} color="#4ade80" />
                          <span className="gradcam-title">AI Attention Heatmap (Grad-CAM)</span>
                        </div>
                        <button
                          className="btn-icon"
                          onClick={() => setGradcamData(null)}
                          title="Close visualization"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="gradcam-body">
                        <div className="gradcam-image-container">
                          <img
                            src={gradcamData.gradcam_image.startsWith('data:')
                              ? gradcamData.gradcam_image
                              : `data:image/jpeg;base64,${gradcamData.gradcam_image}`}
                            alt="Grad-CAM AI Focus"
                            className="gradcam-overlay-img"
                          />
                          <div className="gradcam-badge">
                            Target: {gradcamData.predicted_class} ({gradcamData.confidence}%)
                          </div>
                        </div>
                        <p className="gradcam-caption">
                          <Sparkles size={14} color="#22c55e" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                          <strong>Highlighted areas show where the AI focused during detection</strong>
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Detected Symptoms */}
              {!result.rejected && (
                <div className="card symptoms-card">
                  <div className="card-title">Detected Symptoms</div>
                  <div className="symptoms-grid">
                    {result.detected_symptoms.map(s => (
                      <div key={s.id} className="symptom-chip">
                        <span className="symptom-dot" />
                        {s.label} {s.confidence ? `(${Math.round(s.confidence)}%)` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Care Recommendations */}
              {!result.rejected && result.recommendations && result.recommendations.length > 0 && (
                <div className="card recommendations-card" style={{ marginTop: '1rem' }}>
                  <div className="card-title">Recommended Actions</div>
                  <ul className="recommendations-list" style={{ paddingLeft: '1.25rem', margin: '0.5rem 0 0', color: 'var(--text-secondary, #cbd5e1)' }}>
                    {result.recommendations.map((rec, i) => (
                      <li key={i} style={{ marginBottom: '0.5rem', lineHeight: '1.4' }}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* All Predictions */}
              {!result.rejected && <div className="card predictions-card">
                <div className="card-title">All Disease Probabilities</div>
                {result.all_predictions.map(p => (
                  <div key={p.disease_id} className="pred-row">
                    <span className="pred-name">{p.disease_name}</span>
                    <div className="pred-bar-wrap">
                      <div className="pred-bar" style={{width: `${p.confidence}%`, background: p.color}} />
                    </div>
                    <span className="pred-pct">{p.confidence}%</span>
                  </div>
                ))}
              </div>}


            </div>
          )}
        </div>
      </div>
    </div>
  );
}
