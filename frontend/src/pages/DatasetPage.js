import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  ImageIcon,
  CheckCircle,
  Trash2,
  Video,
  Eye,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckSquare,
  Square,
  Search,
  Sliders,
  Info,
  Film,
  Sparkles
} from 'lucide-react';
import './DatasetPage.css';

export default function DatasetPage() {
  const [diseases, setDiseases] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedModule, setSelectedModule] = useState('eye');
  const [selectedDisease, setSelectedDisease] = useState('');
  
  // Upload State
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [frameInterval, setFrameInterval] = useState(0.5); // seconds per frame
  const [maxVideoFrames, setMaxVideoFrames] = useState(40);

  // Dataset Explorer Gallery State
  const [galleryImages, setGalleryImages] = useState([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [selectedImageKeys, setSelectedImageKeys] = useState(new Set());
  const [gallerySearch, setGallerySearch] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null); // index in filteredImages
  const [failedImages, setFailedImages] = useState(new Set());

  // Load basic diseases and statistics
  const loadStats = async () => {
    try {
      const [dRes, sRes] = await Promise.all([
        axios.get('/api/diseases'),
        axios.get('/api/dataset/stats')
      ]);
      setDiseases(dRes.data.diseases || []);
      setStats(sRes.data || {});

      // Auto-select first disease if none selected
      if (!selectedDisease && dRes.data.diseases?.length > 0) {
        const first = dRes.data.diseases.find(d => d.module === selectedModule) || dRes.data.diseases[0];
        setSelectedDisease(first.id);
      }
    } catch (err) {
      console.error('Error loading dataset stats:', err);
    }
  };

  const handleDeleteBroken = async () => {
    const filenames = Array.from(failedImages);
    if (filenames.length === 0) return;
    if (!window.confirm(`Delete ${filenames.length} corrupt / unreadable file(s)?`)) return;

    try {
      const { data } = await axios.post('/api/dataset/delete-bulk', {
        module: selectedModule,
        disease_id: selectedDisease,
        filenames
      });
      if (data.success) {
        toast.success(`Deleted ${data.deleted_count} corrupt file(s)`);
        setGalleryImages(prev => prev.filter(img => !failedImages.has(img.filename)));
        setFailedImages(new Set());
        loadStats();
      }
    } catch (err) {
      toast.error('Failed to delete corrupt files');
    }
  };

  // Load images for current selected disease
  const loadGalleryImages = useCallback(async (module, diseaseId) => {
    if (!diseaseId) return;
    setLoadingGallery(true);
    try {
      const { data } = await axios.get('/api/dataset/images', {
        params: { module, disease_id: diseaseId }
      });
      setGalleryImages(data.images || []);
      setSelectedImageKeys(new Set());
    } catch (err) {
      console.error('Error loading gallery images:', err);
      toast.error('Failed to load dataset images');
    } finally {
      setLoadingGallery(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (selectedDisease) {
      loadGalleryImages(selectedModule, selectedDisease);
    }
  }, [selectedModule, selectedDisease, loadGalleryImages]);

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic', '.heif'],
      'video/*': ['.mov', '.mp4', '.avi', '.mkv', '.webm', '.m4v']
    },
    multiple: true
  });

  const removeSelectedFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Upload handler
  const handleUpload = async () => {
    if (!selectedDisease) {
      toast.error('Select a disease class first');
      return;
    }
    if (files.length === 0) {
      toast.error('No images or videos selected');
      return;
    }

    setUploading(true);
    const hasVideo = files.some(f => f.type.startsWith('video/') || f.name.toLowerCase().match(/\.(mov|mp4|avi|mkv|webm)$/));

    try {
      const fd = new FormData();
      fd.append('disease_id', selectedDisease);
      fd.append('module', selectedModule);
      fd.append('frame_interval', frameInterval.toString());
      fd.append('max_video_frames', maxVideoFrames.toString());

      files.forEach(f => fd.append('images', f));

      const { data } = await axios.post('/api/dataset/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (data.success) {
        if (data.video_frames > 0) {
          toast.success(`Extracted ${data.video_frames} frames from video & saved ${data.saved} total images!`, { duration: 4000 });
        } else {
          toast.success(`Successfully uploaded ${data.saved} image(s)!`);
        }
        setFiles([]);
        loadStats();
        loadGalleryImages(selectedModule, selectedDisease);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed';
      toast.error(`Upload error: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  // Delete single image
  const handleDeleteSingle = async (filename, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${filename}" from this dataset?`)) {
      return;
    }

    try {
      const { data } = await axios.delete('/api/dataset/image', {
        data: {
          module: selectedModule,
          disease_id: selectedDisease,
          filename
        }
      });
      if (data.success) {
        toast.success(`Deleted ${filename}`);
        setGalleryImages(prev => prev.filter(img => img.filename !== filename));
        setSelectedImageKeys(prev => {
          const next = new Set(prev);
          next.delete(filename);
          return next;
        });
        loadStats();

        // Close lightbox if current image was deleted
        if (lightboxIndex !== null) {
          setLightboxIndex(null);
        }
      }
    } catch (err) {
      toast.error('Failed to delete image');
    }
  };

  // Delete multiple selected images
  const handleDeleteBulk = async () => {
    const filenames = Array.from(selectedImageKeys);
    if (filenames.length === 0) return;

    if (!window.confirm(`Are you sure you want to permanently delete ${filenames.length} selected images?`)) {
      return;
    }

    try {
      const { data } = await axios.post('/api/dataset/delete-bulk', {
        module: selectedModule,
        disease_id: selectedDisease,
        filenames
      });
      if (data.success) {
        toast.success(`Deleted ${data.deleted_count} image(s)`);
        setGalleryImages(prev => prev.filter(img => !selectedImageKeys.has(img.filename)));
        setSelectedImageKeys(new Set());
        loadStats();
      }
    } catch (err) {
      toast.error('Bulk deletion failed');
    }
  };

  // Toggle selection for bulk delete
  const toggleSelectImage = (filename, e) => {
    if (e) e.stopPropagation();
    setSelectedImageKeys(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedImageKeys.size === filteredImages.length) {
      setSelectedImageKeys(new Set());
    } else {
      setSelectedImageKeys(new Set(filteredImages.map(img => img.filename)));
    }
  };

  // Filter diseases by current module
  const moduleDiseases = diseases.filter(d => d.module === selectedModule);
  const selectedDiseaseObj = diseases.find(d => d.id === selectedDisease);

  // Filter gallery images by search
  const filteredImages = useMemo(() => {
    if (!gallerySearch.trim()) return galleryImages;
    const q = gallerySearch.toLowerCase();
    return galleryImages.filter(img => img.filename.toLowerCase().includes(q));
  }, [galleryImages, gallerySearch]);

  const getStatusColor = (count) => {
    if (count === 0) return '#f87171';
    if (count < 20) return '#fbbf24';
    return '#4ade80';
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') {
        setLightboxIndex(prev => (prev < filteredImages.length - 1 ? prev + 1 : 0));
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex(prev => (prev > 0 ? prev - 1 : filteredImages.length - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredImages]);

  const currentLightboxImg = lightboxIndex !== null ? filteredImages[lightboxIndex] : null;

  return (
    <div className="page dataset-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dataset Manager & Explorer</h1>
          <p className="page-subtitle">
            Upload images or videos (.MOV, .MP4, .HEIC, .JPG) and manage training datasets for gamefowl health classification.
          </p>
        </div>
      </div>

      {/* Module Selector Segmented Tabs */}
      <div className="module-tabs-card card">
        <div className="module-tabs-inner">
          <button
            className={`module-tab-btn ${selectedModule === 'eye' ? 'active' : ''}`}
            onClick={() => {
              setSelectedModule('eye');
              const first = diseases.find(d => d.module === 'eye');
              if (first) setSelectedDisease(first.id);
            }}
          >
            <span className="module-tab-icon">👁️</span>
            <div className="module-tab-text">
              <span className="module-tab-title">Eye & Head Module</span>
              <span className="module-tab-subtitle">Infectious Coryza, Fowl Pox, Marek's, Healthy Eye</span>
            </div>
          </button>

          <button
            className={`module-tab-btn ${selectedModule === 'wing' ? 'active' : ''}`}
            onClick={() => {
              setSelectedModule('wing');
              const first = diseases.find(d => d.module === 'wing');
              if (first) setSelectedDisease(first.id);
            }}
          >
            <span className="module-tab-icon">🪶</span>
            <div className="module-tab-text">
              <span className="module-tab-title">Wing & Posture Module</span>
              <span className="module-tab-subtitle">Newcastle Disease, Wing Droop, Healthy Wing</span>
            </div>
          </button>
        </div>
      </div>

      <div className="dataset-grid">
        {/* Left Column: Disease Classes Selector & Health Status */}
        <div className="card stats-panel">
          <div className="card-title-row">
            <span className="card-title">
              {selectedModule === 'eye' ? '👁️ Eye Classes' : '🪶 Wing Classes'}
            </span>
            <span className="class-count-badge">{moduleDiseases.length} Classes</span>
          </div>

          <div className="disease-stats-list">
            {moduleDiseases.map(d => {
              const count = stats[d.id] || 0;
              const isSelected = selectedDisease === d.id;
              return (
                <div
                  key={d.id}
                  className={`stat-row ${isSelected ? 'stat-row-selected' : ''}`}
                  onClick={() => setSelectedDisease(d.id)}
                >
                  <div className="stat-dot" style={{ background: d.color }} />
                  <div className="stat-info">
                    <div className="stat-name-row">
                      <span className="stat-name">{d.name}</span>
                      <span className="stat-module-pill">
                        {d.module === 'eye' ? 'Eye' : 'Wing'}
                      </span>
                    </div>
                    <div className="stat-count" style={{ color: getStatusColor(count) }}>
                      <strong>{count} images</strong> {count < 3 ? '— need 3+' : count < 20 ? '— low' : '✓ ready'}
                    </div>
                  </div>
                  <div className="stat-bar-wrap">
                    <div
                      className="stat-bar"
                      style={{
                        width: `${Math.min(100, (count / 50) * 100)}%`,
                        background: getStatusColor(count)
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {selectedDiseaseObj && (
            <div className="disease-details-box">
              <div className="disease-desc-title">About {selectedDiseaseObj.name}</div>
              <p className="disease-desc-text">{selectedDiseaseObj.description}</p>
              <div className="symptoms-tag-cloud">
                {selectedDiseaseObj.symptoms?.map(s => (
                  <span key={s} className="symptom-mini-tag">
                    #{s.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Upload Panel (Images & Video Frame Extraction) */}
        <div className="upload-panel">
          <div className="card upload-card">
            <div className="card-title-row">
              <span className="card-title">Upload Dataset Media</span>
              <span className="format-pills">
                <span className="fmt-pill">HEIC</span>
                <span className="fmt-pill">JPG/PNG</span>
                <span className="fmt-pill">MOV/MP4</span>
              </span>
            </div>

            {selectedDiseaseObj && (
              <div className="class-hint">
                <div className="hint-label">Target Dataset Class:</div>
                <div className="hint-val" style={{ color: selectedDiseaseObj.color }}>
                  {selectedDiseaseObj.name}
                  <span className="hint-module-tag">
                    {selectedModule === 'eye' ? '👁️ Eye Module' : '🪶 Wing Module'}
                  </span>
                </div>
              </div>
            )}

            {/* Video Frame Extraction Settings */}
            <div className="video-settings-panel">
              <div className="video-settings-title">
                <Film size={14} color="#60a5fa" />
                <span>Video Auto-Frame Extractor Settings</span>
              </div>
              <div className="video-settings-grid">
                <div className="setting-item">
                  <label>Capture Interval:</label>
                  <select
                    value={frameInterval}
                    onChange={e => setFrameInterval(parseFloat(e.target.value))}
                    className="select-input"
                  >
                    <option value={0.25}>Every 0.25s (Rapid 4 FPS)</option>
                    <option value={0.5}>Every 0.5s (Standard 2 FPS - Recommended)</option>
                    <option value={1.0}>Every 1.0s (1 FPS)</option>
                    <option value={2.0}>Every 2.0s (Keyframes)</option>
                  </select>
                </div>
                <div className="setting-item">
                  <label>Max Frames / Video:</label>
                  <select
                    value={maxVideoFrames}
                    onChange={e => setMaxVideoFrames(parseInt(e.target.value))}
                    className="select-input"
                  >
                    <option value={20}>20 frames</option>
                    <option value={40}>40 frames (Recommended)</option>
                    <option value={60}>60 frames</option>
                    <option value={100}>100 frames</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dropzone */}
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}>
              <input {...getInputProps()} />
              <div className="dropzone-icons-row">
                <Upload size={28} color="#4ade80" />
                <Video size={28} color="#60a5fa" />
              </div>
              <p className="dropzone-text">
                {isDragActive
                  ? 'Drop images or video here...'
                  : 'Drag & drop photos, iPhone HEIC, or videos (.MOV, .MP4)'}
              </p>
              <p className="dropzone-sub">
                Supports HEIC, JPG, PNG, WebP, MOV, MP4 — videos are auto-extracted frame by frame
              </p>
            </div>

            {/* Selected Staged Files Preview */}
            {files.length > 0 && (
              <div className="selected-files animate-in">
                <div className="files-header">
                  <span className="files-header-title">
                    <CheckCircle size={15} color="#4ade80" />
                    <span>{files.length} file{files.length > 1 ? 's' : ''} staged for upload</span>
                  </span>
                  <button className="clear-btn" onClick={() => setFiles([])}>Clear All</button>
                </div>

                <div className="staged-files-list">
                  {files.slice(0, 10).map((f, i) => {
                    const isVid = f.type.startsWith('video/') || f.name.toLowerCase().match(/\.(mov|mp4|avi|mkv)$/);
                    const isHeic = f.name.toLowerCase().match(/\.(heic|heif)$/);
                    return (
                      <div key={i} className="staged-file-row">
                        <div className="file-badge-type">
                          {isVid ? <Video size={14} color="#60a5fa" /> : <ImageIcon size={14} color="#4ade80" />}
                          <span className="file-ext-tag">{isHeic ? 'HEIC' : isVid ? 'VIDEO' : 'IMAGE'}</span>
                        </div>
                        <span className="staged-file-name" title={f.name}>{f.name}</span>
                        <span className="staged-file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button
                          className="file-remove-btn"
                          onClick={() => removeSelectedFile(i)}
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {files.length > 10 && (
                    <div className="more-files-row">+ {files.length - 10} more files staged</div>
                  )}
                </div>

                <div className="upload-actions-row">
                  <button
                    className="btn btn-primary upload-btn"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <RefreshCw size={16} className="spin" />
                        Processing & Extracting Media...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        Upload {files.length} Item{files.length > 1 ? 's' : ''} to {selectedDiseaseObj?.name}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dataset Explorer Gallery Card */}
      <div className="card gallery-card">
        <div className="gallery-header">
          <div className="gallery-header-left">
            <h2 className="gallery-title">
              Dataset Gallery: <span style={{ color: selectedDiseaseObj?.color || '#4ade80' }}>{selectedDiseaseObj?.name || 'Loading...'}</span>
            </h2>
            <span className="gallery-total-tag">
              {galleryImages.length} Image{galleryImages.length !== 1 ? 's' : ''} Total
            </span>
          </div>

          <div className="gallery-controls">
            {/* Search filter */}
            <div className="search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Filter by filename..."
                value={gallerySearch}
                onChange={e => setGallerySearch(e.target.value)}
                className="search-input"
              />
              {gallerySearch && (
                <button className="search-clear" onClick={() => setGallerySearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Select All */}
            {filteredImages.length > 0 && (
              <button className="btn btn-secondary select-all-btn" onClick={toggleSelectAll}>
                {selectedImageKeys.size === filteredImages.length ? (
                  <><CheckSquare size={15} color="#4ade80" /> Deselect All</>
                ) : (
                  <><Square size={15} /> Select All ({selectedImageKeys.size})</>
                )}
              </button>
            )}

            {/* Bulk Delete */}
            {selectedImageKeys.size > 0 && (
              <button className="btn btn-danger bulk-delete-btn" onClick={handleDeleteBulk}>
                <Trash2 size={15} /> Delete Selected ({selectedImageKeys.size})
              </button>
            )}

            {/* Delete All Corrupt / Broken Files */}
            {failedImages.size > 0 && (
              <button className="btn btn-danger bulk-delete-btn animate-in" onClick={handleDeleteBroken}>
                <Trash2 size={15} /> Delete Broken Files ({failedImages.size})
              </button>
            )}

            {/* Refresh */}
            <button
              className="btn btn-secondary icon-btn"
              onClick={() => loadGalleryImages(selectedModule, selectedDisease)}
              title="Refresh Gallery"
              disabled={loadingGallery}
            >
              <RefreshCw size={15} className={loadingGallery ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Gallery Grid */}
        {loadingGallery ? (
          <div className="gallery-loading">
            <RefreshCw size={24} className="spin" color="#4ade80" />
            <span>Loading dataset images...</span>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="gallery-empty">
            <AlertCircle size={36} color="#fbbf24" />
            <div className="empty-title">No images in this dataset class yet</div>
            <p className="empty-sub">
              Upload photos or videos using the dropzone above to add training data to {selectedDiseaseObj?.name}.
            </p>
          </div>
        ) : (
          <div className="gallery-grid">
            {filteredImages.map((img, idx) => {
              const isSelected = selectedImageKeys.has(img.filename);
              return (
                <div
                  key={img.filename}
                  className={`gallery-item ${isSelected ? 'gallery-item-selected' : ''}`}
                  onClick={() => setLightboxIndex(idx)}
                >
                  <div className="img-wrap">
                    <img
                      src={img.url}
                      alt={img.filename}
                      loading="lazy"
                      onError={e => {
                        e.target.onerror = null;
                        e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%231a0a0a" width="100" height="100"/><text fill="%23ef4444" font-family="sans-serif" font-size="12" font-weight="bold" x="50%" y="50%" text-anchor="middle" dy=".3em">Broken File</text></svg>';
                        setFailedImages(prev => new Set(prev).add(img.filename));
                      }}
                    />
                    {/* Hover actions overlay */}
                    <div className="img-hover-overlay">
                      <button
                        className="overlay-btn zoom-btn"
                        title="View Full Resolution"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(idx);
                        }}
                      >
                        <ZoomIn size={15} />
                      </button>
                      <button
                        className="overlay-btn delete-btn"
                        title="Delete this image"
                        onClick={(e) => handleDeleteSingle(img.filename, e)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Checkbox badge */}
                    <div
                      className={`img-select-checkbox ${isSelected ? 'checked' : ''}`}
                      onClick={(e) => toggleSelectImage(img.filename, e)}
                      title="Select for bulk actions"
                    >
                      {isSelected ? <CheckSquare size={16} color="#4ade80" /> : <Square size={16} />}
                    </div>
                  </div>

                  {failedImages.has(img.filename) && (
                    <div className="broken-file-card-action animate-in">
                      <span className="broken-file-badge">⚠️ Unreadable File</span>
                      <button
                        className="btn btn-danger btn-xs delete-broken-btn"
                        onClick={(e) => handleDeleteSingle(img.filename, e)}
                        title="Permanently remove this file from dataset"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}

                  <div className="gallery-item-meta">
                    <span className="img-name" title={img.filename}>
                      {img.filename}
                    </span>
                    <div className="img-meta-row">
                      <span className="img-size">{img.size_formatted}</span>
                      <span className="img-date">{img.modified}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {currentLightboxImg && (
        <div className="lightbox-modal animate-in" onClick={() => setLightboxIndex(null)}>
          <div className="lightbox-container" onClick={e => e.stopPropagation()}>
            <div className="lightbox-header">
              <div className="lightbox-info">
                <span className="lightbox-filename">{currentLightboxImg.filename}</span>
                <span className="lightbox-meta">
                  {selectedDiseaseObj?.name} • {currentLightboxImg.size_formatted} • {currentLightboxImg.modified}
                </span>
              </div>
              <div className="lightbox-header-actions">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteSingle(currentLightboxImg.filename)}
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button className="lightbox-close" onClick={() => setLightboxIndex(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="lightbox-body">
              <img
                src={currentLightboxImg.url}
                alt={currentLightboxImg.filename}
                className="lightbox-img"
              />

              {/* Prev / Next controls */}
              {filteredImages.length > 1 && (
                <>
                  <button
                    className="lightbox-nav-btn prev-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(prev => (prev > 0 ? prev - 1 : filteredImages.length - 1));
                    }}
                    title="Previous image (Left Arrow)"
                  >
                    <ChevronLeft size={28} />
                  </button>
                  <button
                    className="lightbox-nav-btn next-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(prev => (prev < filteredImages.length - 1 ? prev + 1 : 0));
                    }}
                    title="Next image (Right Arrow)"
                  >
                    <ChevronRight size={28} />
                  </button>
                </>
              )}
            </div>

            <div className="lightbox-footer">
              <span>Image {lightboxIndex + 1} of {filteredImages.length}</span>
              <span className="lightbox-hint">Use Left / Right arrow keys to navigate, Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
