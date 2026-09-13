import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, FlaskConical, ChevronDown, ChevronUp, Folder, Info } from 'lucide-react';
import './DiseasesPage.css';

const SEVERITY_OPTIONS = ['none', 'moderate', 'high', 'critical'];
const PARTS_OPTIONS = ['eye', 'wing', 'posture', 'skin', 'comb', 'all'];
const COLORS = ['#4ade80', '#fbbf24', '#fb923c', '#f87171', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#8b5cf6'];

const DEFAULT_SYMPTOMS = {
  eye: ['watery_eyes', 'swollen_eyes', 'nasal_discharge', 'facial_swelling', 'eye_lesions', 'cloudy_eye', 'gray_iris', 'irregular_pupil'],
  wing: ['drooping_wings', 'severe_droop', 'wing_weakness'],
  skin: ['skin_lesions', 'scabs'],
  comb: ['comb_discoloration', 'pale_comb'],
  posture: ['twisted_neck', 'lethargic_stance', 'imbalance'],
  all: ['normal_eye', 'normal_posture', 'symmetrical_wings']
};

export default function DiseasesPage() {
  const [diseases, setDiseases] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filterModule, setFilterModule] = useState('all'); // 'all' | 'eye' | 'wing'
  
  const [form, setForm] = useState({
    name: '',
    module: 'eye',
    description: '',
    symptoms: [],
    affected_parts: ['eye'],
    severity: 'moderate',
    color: COLORS[1]
  });
  
  const [symptomInput, setSymptomInput] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get('/api/diseases');
      setDiseases(data.diseases || []);
    } catch (err) {
      toast.error('Failed to load diseases');
    }
  };

  useEffect(() => { load(); }, []);

  const togglePart = (part) => {
    setForm(f => ({
      ...f,
      affected_parts: f.affected_parts.includes(part)
        ? f.affected_parts.filter(p => p !== part)
        : [...f.affected_parts, part]
    }));
  };

  const addSymptom = (sym) => {
    const s = sym.trim().toLowerCase().replace(/ /g, '_');
    if (!s || form.symptoms.includes(s)) return;
    setForm(f => ({ ...f, symptoms: [...f.symptoms, s] }));
    setSymptomInput('');
  };

  const addSuggestedSymptoms = (part) => {
    const suggestions = DEFAULT_SYMPTOMS[part] || [];
    setForm(f => ({
      ...f,
      symptoms: [...new Set([...f.symptoms, ...suggestions])]
    }));
  };

  const removeSymptom = (s) => setForm(f => ({ ...f, symptoms: f.symptoms.filter(x => x !== s) }));

  // Compute clean normalized folder ID
  const derivedId = form.name.trim()
    ? form.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')
    : '[disease_folder]';

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Disease name required'); return; }
    try {
      const payload = {
        ...form,
        id: derivedId,
        module: form.module || 'eye'
      };
      await axios.post('/api/diseases', payload);
      toast.success(`Disease "${form.name}" added to ${form.module.toUpperCase()} module!`);
      setShowForm(false);
      setForm({
        name: '',
        module: 'eye',
        description: '',
        symptoms: [],
        affected_parts: ['eye'],
        severity: 'moderate',
        color: COLORS[1]
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add disease');
    }
  };

  const deleteDis = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? Existing images in the dataset folder will be preserved.`)) return;
    try {
      await axios.delete(`/api/diseases/${id}`);
      toast.success(`Deleted "${name}"`);
      load();
    } catch (err) {
      toast.error('Failed to delete disease');
    }
  };

  const filteredDiseases = diseases.filter(d => {
    if (filterModule === 'all') return true;
    return d.module === filterModule;
  });

  return (
    <div className="page diseases-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 className="page-title">Disease Library & Class Mapping</h1>
          <p className="page-subtitle">Configure gamefowl diseases, assign anatomical modules (Eye vs Wing), and manage AI classes.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add Disease
        </button>
      </div>

      {/* Module Filter Tabs */}
      <div className="disease-module-filter-bar">
        <button
          className={`filter-pill ${filterModule === 'all' ? 'filter-pill-active' : ''}`}
          onClick={() => setFilterModule('all')}
        >
          All Classes ({diseases.length})
        </button>
        <button
          className={`filter-pill ${filterModule === 'eye' ? 'filter-pill-active' : ''}`}
          onClick={() => setFilterModule('eye')}
        >
          👁️ Eye & Head ({diseases.filter(d => d.module === 'eye').length})
        </button>
        <button
          className={`filter-pill ${filterModule === 'wing' ? 'filter-pill-active' : ''}`}
          onClick={() => setFilterModule('wing')}
        >
          🪶 Wing & Posture ({diseases.filter(d => d.module === 'wing').length})
        </button>
      </div>

      {/* Add Disease Form */}
      {showForm && (
        <div className="card add-form animate-in" style={{ marginBottom: 24 }}>
          <div className="card-title">Add New Disease Class</div>

          {/* Module Selector */}
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Target Anatomical Module *</label>
            <div className="module-choice-grid">
              <button
                type="button"
                className={`module-choice-card ${form.module === 'eye' ? 'module-choice-selected' : ''}`}
                onClick={() => setForm(f => ({
                  ...f,
                  module: 'eye',
                  affected_parts: ['eye']
                }))}
              >
                <span className="choice-icon">👁️</span>
                <div className="choice-text">
                  <div className="choice-title">Eye & Head Module</div>
                  <div className="choice-sub">datasets/eye/... (Coryza, Fowl Pox, Marek's)</div>
                </div>
              </button>

              <button
                type="button"
                className={`module-choice-card ${form.module === 'wing' ? 'module-choice-selected' : ''}`}
                onClick={() => setForm(f => ({
                  ...f,
                  module: 'wing',
                  affected_parts: ['wing', 'posture']
                }))}
              >
                <span className="choice-icon">🪶</span>
                <div className="choice-text">
                  <div className="choice-title">Wing & Posture Module</div>
                  <div className="choice-sub">datasets/wing/... (Newcastle, Droop)</div>
                </div>
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Disease Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Newcastle Disease, Marek's Disease"
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Severity Level</label>
              <select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="input-field"
              >
                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {/* Target Directory Path Feedback */}
          <div className="target-folder-feedback">
            <Folder size={14} color="#4ade80" />
            <span>
              Target Dataset Directory:{' '}
              <strong>datasets/{form.module}/{derivedId}/</strong>
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Clinical description, causes, and visible indicators..."
              className="input-field"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Color Indicator Tag</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot ${form.color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Affected Body Parts</label>
            <div className="chip-row">
              {PARTS_OPTIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${form.affected_parts.includes(p) ? 'chip-active' : ''}`}
                  onClick={() => { togglePart(p); addSuggestedSymptoms(p); }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Symptoms (Visual Indicators)</label>
            <div className="symptom-input-row">
              <input
                value={symptomInput}
                onChange={e => setSymptomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSymptom(symptomInput);
                  }
                }}
                placeholder="Type symptom and press Enter (e.g. drooping_wings, cloudy_eye)"
                className="input-field"
              />
              <button type="button" className="btn btn-secondary" onClick={() => addSymptom(symptomInput)}>Add</button>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {form.symptoms.map(s => (
                <span key={s} className="chip chip-active chip-removable">
                  {s.replace(/_/g, ' ')}
                  <button type="button" onClick={() => removeSymptom(s)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={submit}>
              <Plus size={16} /> Save Disease to {form.module.toUpperCase()} Module
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Disease List */}
      <div className="diseases-list">
        {filteredDiseases.map(d => (
          <div key={d.id} className="card disease-card" style={{ borderLeftColor: d.color, borderLeftWidth: 4 }}>
            <div className="disease-header" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <div className="disease-info">
                <FlaskConical size={18} color={d.color} />
                <div>
                  <div className="disease-name-row">
                    <span className="disease-name">{d.name}</span>
                    <span className="disease-module-badge">
                      {d.module === 'eye' ? '👁️ Eye Module' : '🪶 Wing Module'}
                    </span>
                    <span className="tag" style={{ background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}30` }}>
                      {d.severity?.toUpperCase()}
                    </span>
                  </div>
                  <div className="disease-folder-tag">
                    📁 datasets/{d.module || 'eye'}/{d.id}/
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-danger icon-btn-sm"
                  onClick={e => { e.stopPropagation(); deleteDis(d.id, d.name); }}
                  title={`Delete ${d.name}`}
                >
                  <Trash2 size={14} />
                </button>
                {expanded === d.id ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
              </div>
            </div>

            {expanded === d.id && (
              <div className="disease-details animate-in">
                <p className="disease-desc">{d.description || 'No description provided.'}</p>
                <div style={{ marginTop: 12 }}>
                  <div className="form-label">Affected Parts</div>
                  <div className="chip-row">
                    {d.affected_parts?.map(p => <span key={p} className="chip chip-active">{p}</span>)}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="form-label">Symptoms / Visual Signs</div>
                  <div className="chip-row">
                    {d.symptoms?.map(s => (
                      <span key={s} className="symptom-chip" style={{ fontSize: 12 }}>
                        <span className="symptom-dot" />
                        {s.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
