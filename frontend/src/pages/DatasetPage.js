import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { Upload, ImageIcon, CheckCircle } from 'lucide-react';
import './DatasetPage.css';

export default function DatasetPage() {
  const [diseases, setDiseases] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedDisease, setSelectedDisease] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const loadData = async () => {
    const [d, s] = await Promise.all([
      axios.get('/api/diseases'),
      axios.get('/api/dataset/stats')
    ]);
    setDiseases(d.data.diseases);
    setStats(s.data);
    if (!selectedDisease && d.data.diseases.length > 0) {
      setSelectedDisease(d.data.diseases[0].id);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onDrop = useCallback(accepted => {
    setFiles(prev => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.webp'] },
    multiple: true
  });

  const upload = async () => {
    if (!selectedDisease) { toast.error('Select a disease class first'); return; }
    if (files.length === 0) { toast.error('No images selected'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('disease_id', selectedDisease);
      files.forEach(f => fd.append('images', f));
      const { data } = await axios.post('/api/dataset/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`Uploaded ${data.saved} images to ${selectedDisease}`);
      setFiles([]);
      loadData();
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (count) => {
    if (count === 0) return '#f87171';
    if (count < 20) return '#fbbf24';
    return '#4ade80';
  };

  const selectedDiseaseObj = diseases.find(d => d.id === selectedDisease);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dataset Manager</h1>
        <p className="page-subtitle">Upload training images for each disease class. Aim for 50+ images per class for good accuracy.</p>
      </div>

      <div className="dataset-grid">
        {/* Left: Disease selector & stats */}
        <div className="card stats-panel">
          <div className="card-title">Disease Classes</div>
          <div className="disease-stats-list">
            {diseases.map(d => {
              const count = stats[d.id] || 0;
              return (
                <div key={d.id}
                  className={`stat-row ${selectedDisease === d.id ? 'stat-row-selected' : ''}`}
                  onClick={() => setSelectedDisease(d.id)}>
                  <div className="stat-dot" style={{background: d.color}} />
                  <div className="stat-info">
                    <div className="stat-name">{d.name}</div>
                    <div className="stat-count" style={{color: getStatusColor(count)}}>
                      {count} images {count < 3 ? '— need more' : count < 20 ? '— low' : '✓ ok'}
                    </div>
                  </div>
                  <div className="stat-bar-wrap">
                    <div className="stat-bar" style={{
                      width: `${Math.min(100, (count / 50) * 100)}%`,
                      background: getStatusColor(count)
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Dropzone upload */}
        <div className="upload-panel">
          <div className="card">
            <div className="card-title">Upload Images</div>

            <div className="form-group">
              <label className="form-label">Target Disease Class</label>
              <select value={selectedDisease} onChange={e => setSelectedDisease(e.target.value)}>
                {diseases.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({stats[d.id] || 0} images)</option>
                ))}
              </select>
            </div>

            {selectedDiseaseObj && (
              <div className="class-hint">
                <span>Uploading to:</span>
                <span style={{color: selectedDiseaseObj.color, fontWeight: 600}}>
                  {selectedDiseaseObj.name}
                </span>
                <div className="class-symptoms">
                  Tips: capture visible signs like — {selectedDiseaseObj.symptoms.slice(0,3).join(', ').replace(/_/g,' ')}
                </div>
              </div>
            )}

            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}>
              <input {...getInputProps()} />
              <Upload size={32} color="#4a6a4a" />
              <p className="dropzone-text">
                {isDragActive ? 'Drop images here...' : 'Drag & drop images, or click to browse'}
              </p>
              <p className="dropzone-sub">JPG, PNG, WebP — multiple files supported</p>
            </div>

            {files.length > 0 && (
              <div className="selected-files animate-in">
                <div className="files-header">
                  <ImageIcon size={14} color="#4ade80" />
                  <span>{files.length} image{files.length > 1 ? 's' : ''} selected</span>
                </div>
                <div className="file-thumbs">
                  {files.slice(0, 8).map((f, i) => (
                    <div key={i} className="file-thumb">
                      <img src={URL.createObjectURL(f)} alt="" />
                    </div>
                  ))}
                  {files.length > 8 && (
                    <div className="file-thumb more-thumb">+{files.length - 8}</div>
                  )}
                </div>
                <div style={{display:'flex', gap:10, marginTop:12}}>
                  <button className="btn btn-primary" onClick={upload} disabled={uploading}>
                    {uploading ? 'Uploading...' : <><CheckCircle size={16}/> Upload {files.length} Images</>}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setFiles([])}>Clear</button>
                </div>
              </div>
            )}
          </div>

          <div className="card tips-card">
            <div className="card-title">📷 Image Tips</div>
            <ul className="tips-list">
              <li>Use <strong>natural daylight</strong> or bright lighting — avoid heavy shadows</li>
              <li>Capture the <strong>affected region clearly</strong> (eye close-up or full wing side-view)</li>
              <li>Include variety: different angles, distances, and lighting conditions</li>
              <li>Aim for <strong>50+ images per class</strong> for reliable detection</li>
              <li>Include <strong>healthy chickens</strong> in the "Healthy" class for contrast</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
