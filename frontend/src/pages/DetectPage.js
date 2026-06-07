import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, Loader, Upload } from 'lucide-react';
import './DetectPage.css';

export default function DetectPage() {
  const webcamRef = useRef(null);
  const fileRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [camError, setCamError] = useState(false);

  const capture = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img) {
      setCapturedImage(img);
      setResult(null);
    }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedImage(ev.target.result);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!capturedImage) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/api/detect', { image: capturedImage });
      setResult(data);
      if (data.rejected) {
        toast.error('Not a chicken — see details below');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Detection failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setResult(null);
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
          <div className="card-title">Camera / Image Input</div>

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
                <button className="btn btn-primary" onClick={analyze} disabled={loading}>
                  {loading ? <Loader size={16} className="spin" /> : <CheckCircle size={16} />}
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
                <button className="btn btn-secondary" onClick={reset}>
                  <RefreshCw size={16} /> Retake
                </button>
              </>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="results-panel">
          {!result && !loading && (
            <div className="card result-placeholder">
              <div className="placeholder-icon">🔬</div>
              <p className="placeholder-text">Capture an image and click Analyze to detect diseases</p>
            </div>
          )}

          {loading && (
            <div className="card result-placeholder">
              <Loader size={32} className="spin" color="#4ade80" />
              <p className="placeholder-text">Running CNN analysis...</p>
            </div>
          )}

          {result && (
            <div className="results animate-in">
              {/* Rejection Card */}
              {result.rejected && (
                <div className="card rejection-card">
                  <div className="rejection-icon">🚫</div>
                  <div className="rejection-title">Not a Chicken</div>
                  <p className="rejection-message">{result.message}</p>
                  <div className="rejection-reason">{result.rejection_reason}</div>
                  <button className="btn btn-secondary" style={{marginTop:12}} onClick={reset}>
                    Try Again
                  </button>
                </div>
              )}

              {/* Top Disease Flag */}
              {!result.rejected && <div className="card disease-flag" style={{borderColor: result.top_prediction.color}}>
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

              }

              {/* Detected Symptoms */}
              {!result.rejected && <div className="card symptoms-card">
                <div className="card-title">Detected Symptoms</div>
                <div className="symptoms-grid">
                  {result.detected_symptoms.map(s => (
                    <div key={s.id} className="symptom-chip">
                      <span className="symptom-dot" />
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>}

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
