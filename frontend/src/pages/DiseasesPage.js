import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, FlaskConical, ChevronDown, ChevronUp, Folder, Info, Layers, X, Sparkles } from 'lucide-react';
import { DynamicModuleIcon, EyeModuleIcon, WingModuleIcon, CombModuleIcon, FeetModuleIcon } from '../components/icons';
import ConfirmModal from '../components/ConfirmModal';
import './DiseasesPage.css';

const SEVERITY_OPTIONS = ['none', 'moderate', 'high', 'critical'];
const PARTS_OPTIONS = ['eye', 'wing', 'posture', 'skin', 'comb', 'feet', 'all'];
const COLORS = ['#4ade80', '#fbbf24', '#fb923c', '#f87171', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#8b5cf6'];

const DEFAULT_SYMPTOMS = {
  eye: ['watery_eyes', 'swollen_eyes', 'nasal_discharge', 'facial_swelling', 'eye_lesions', 'cloudy_eye', 'gray_iris', 'irregular_pupil'],
  wing: ['drooping_wings', 'severe_droop', 'wing_weakness'],
  skin: ['skin_lesions', 'scabs'],
  comb: ['comb_discoloration', 'pale_comb', 'black_scabs', 'cyanosis'],
  posture: ['twisted_neck', 'lethargic_stance', 'imbalance'],
  feet: ['bumblefoot', 'swollen_footpad', 'scaly_leg_mites', 'raised_scales', 'spur_lesions', 'leg_paralysis'],
  all: ['normal_eye', 'normal_posture', 'symmetrical_wings', 'normal_feet']
};

export default function DiseasesPage() {
  const [diseases, setDiseases] = useState([]);
  const [modules, setModules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [filterModule, setFilterModule] = useState('all');

  const [form, setForm] = useState({
    name: '',
    module: 'eye',
    description: '',
    symptoms: [],
    affected_parts: ['eye'],
    severity: 'moderate',
    color: COLORS[1]
  });

  const [newModuleForm, setNewModuleForm] = useState({
    name: '',
    display_name: '',
    description: '',
    icon: 'comb',
    color: '#8b5cf6'
  });
  const [isSubmittingModule, setIsSubmittingModule] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    itemName: '',
    detail: '',
    confirmText: 'Delete',
    confirmVariant: 'danger',
    onConfirm: null
  });

  const [symptomInput, setSymptomInput] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        axios.get('/api/diseases'),
        axios.get('/api/modules')
      ]);
      setDiseases(dRes.data.diseases || []);
      const mods = mRes.data.modules || [];
      setModules(mods);

      // Default form module to first available if invalid
      if (mods.length > 0 && !mods.some(m => m.id === form.module)) {
        setForm(f => ({ ...f, module: mods[0].id, affected_parts: [mods[0].id] }));
      }
    } catch (err) {
      toast.error('Failed to load diseases or anatomical modules');
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
        module: modules[0]?.id || 'eye',
        description: '',
        symptoms: [],
        affected_parts: [modules[0]?.id || 'eye'],
        severity: 'moderate',
        color: COLORS[1]
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add disease');
    }
  };

  const deleteDis = (id, name) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Disease Class?',
      message: 'Are you sure you want to permanently remove disease class',
      itemName: name,
      detail: 'Existing sample images in the dataset repository will be preserved on disk.',
      confirmText: 'Delete Class',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/diseases/${id}`);
          toast.success(`Deleted "${name}"`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          load();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete disease');
        }
      }
    });
  };

  const handleCreateModule = async () => {
    if (!newModuleForm.name.trim()) {
      toast.error('Module name is required');
      return;
    }
    setIsSubmittingModule(true);
    try {
      const payload = {
        name: newModuleForm.name.trim(),
        display_name: newModuleForm.display_name.trim() || `${newModuleForm.name.trim()} Module`,
        description: newModuleForm.description.trim() || `Inspection module for ${newModuleForm.name.trim().toLowerCase()} conditions`,
        icon: newModuleForm.icon || 'comb',
        color: newModuleForm.color || '#8b5cf6'
      };
      const { data } = await axios.post('/api/modules', payload);
      if (data.success) {
        toast.success(`Module "${data.module.name}" added with automated healthy class baseline!`);
        setShowModuleModal(false);
        setNewModuleForm({
          name: '',
          display_name: '',
          description: '',
          icon: 'comb',
          color: '#8b5cf6'
        });
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create module');
    } finally {
      setIsSubmittingModule(false);
    }
  };

  const handleDeleteModule = (moduleId, moduleName) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Anatomical Module?',
      message: 'Are you sure you want to permanently delete module',
      itemName: moduleName,
      detail: 'All assigned disease classes in this module will also be unlinked. Note that default system modules cannot be deleted.',
      confirmText: 'Delete Module',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const { data } = await axios.delete(`/api/modules/${moduleId}`);
          if (data.success) {
            toast.success(`Module "${moduleName}" removed`);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            if (filterModule === moduleId) setFilterModule('all');
            load();
          }
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete module');
        }
      }
    });
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
          <p className="page-subtitle">Configure gamefowl diseases, register dynamic anatomical modules, and manage micro-model training classes.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowModuleModal(true)}>
            <Layers size={16} /> Add Anatomy Module
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Add Disease
          </button>
        </div>
      </div>

      {/* Module Filter Tabs */}
      <div className="disease-module-filter-bar">
        <button
          className={`filter-pill ${filterModule === 'all' ? 'filter-pill-active' : ''}`}
          onClick={() => setFilterModule('all')}
        >
          All Classes ({diseases.length})
        </button>

        {modules.map(m => {
          const count = diseases.filter(d => d.module === m.id).length;
          const isActive = filterModule === m.id;
          return (
            <div key={m.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                className={`filter-pill ${isActive ? 'filter-pill-active' : ''}`}
                onClick={() => setFilterModule(m.id)}
              >
                <DynamicModuleIcon module={m.id} icon={m.icon} size={14} color={isActive ? '#22c55e' : m.color || '#94a3b8'} style={{ marginRight: 6 }} />
                <span>{m.name} ({count})</span>
                {!m.is_default && (
                  <span
                    className="delete-mod-btn"
                    title={`Delete ${m.name} module`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteModule(m.id, m.name);
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Anatomical Module Modal */}
      {showModuleModal && (
        <div className="module-modal-overlay" onClick={() => setShowModuleModal(false)}>
          <div className="module-modal-card" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <div className="module-modal-title">
                <Layers size={20} color="#22c55e" />
                <span>Add Anatomical Module</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowModuleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Register a new anatomical part (e.g. <strong>Comb & Wattle</strong>, <strong>Shanks & Feet</strong>, <strong>Feces</strong>). The system will automatically create its dataset directory, seed a baseline healthy class, and generate an independent micro-model architecture.
            </p>

            <div className="form-group">
              <label className="form-label">Anatomical Part Name *</label>
              <input
                value={newModuleForm.name}
                onChange={e => {
                  const val = e.target.value;
                  setNewModuleForm(prev => ({
                    ...prev,
                    name: val,
                    display_name: prev.display_name ? prev.display_name : `${val} Module`
                  }));
                }}
                placeholder="e.g. Comb & Wattle, Shanks, Feces"
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Display Title</label>
              <input
                value={newModuleForm.display_name}
                onChange={e => setNewModuleForm(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="e.g. Comb & Wattle Module"
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Clinical Scope & Description</label>
              <textarea
                value={newModuleForm.description}
                onChange={e => setNewModuleForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
                placeholder="e.g. Evaluates comb discoloration, dry pox scabs, or wattle lesions..."
                className="input-field"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Module Accent Color</label>
                <div className="color-picker">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot ${newModuleForm.color === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewModuleForm(prev => ({ ...prev, color: c }))}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Icon Profile</label>
                <select
                  value={newModuleForm.icon}
                  onChange={e => setNewModuleForm(prev => ({ ...prev, icon: e.target.value }))}
                  className="input-field"
                >
                  <option value="feet">Feet / Shanks & Spurs</option>
                  <option value="comb">Rooster Comb / Crown</option>
                  <option value="eye">Ocular / Eye Vision</option>
                  <option value="wing">Wing / Flight Feather</option>
                  <option value="generic">Anatomical Target / Crosshair</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModuleModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateModule}
                disabled={isSubmittingModule}
              >
                <Plus size={16} /> {isSubmittingModule ? 'Creating Module...' : 'Create Anatomy Module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Disease Form */}
      {showForm && (
        <div className="card add-form animate-in" style={{ marginBottom: 24 }}>
          <div className="card-title">Add New Disease Class</div>

          {/* Dynamic Module Selector */}
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Target Anatomical Module *</label>
            <div className="module-choice-grid">
              {modules.map(m => {
                const isSelected = form.module === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`module-choice-card ${isSelected ? 'module-choice-selected' : ''}`}
                    onClick={() => setForm(f => ({
                      ...f,
                      module: m.id,
                      affected_parts: [m.id]
                    }))}
                  >
                    <span className="choice-icon">
                      <DynamicModuleIcon module={m.id} icon={m.icon} size={20} color={isSelected ? '#22c55e' : m.color || '#8f949a'} />
                    </span>
                    <div className="choice-text">
                      <div className="choice-title">{m.display_name || `${m.name} Module`}</div>
                      <div className="choice-sub">datasets/{m.id}/... ({m.name})</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Disease Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Newcastle Disease, Fowl Pox"
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
                placeholder="Type symptom and press Enter (e.g. drooping_wings, cloudy_eye, comb_lesions)"
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
        {filteredDiseases.map(d => {
          const modObj = modules.find(m => m.id === d.module) || { name: d.module, color: '#60a5fa' };
          return (
            <div key={d.id} className="card disease-card" style={{ borderLeftColor: d.color, borderLeftWidth: 4 }}>
              <div className="disease-header" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                <div className="disease-info">
                  <FlaskConical size={18} color={d.color} />
                  <div>
                    <div className="disease-name-row">
                      <span className="disease-name">{d.name}</span>
                      <span className="disease-module-badge" style={{ color: modObj.color || '#60a5fa', borderColor: `${modObj.color || '#60a5fa'}40` }}>
                        <DynamicModuleIcon module={d.module} size={12} style={{ marginRight: 4 }} color={modObj.color || '#60a5fa'} />
                        {modObj.name || d.module} Module
                      </span>
                      <span className="tag" style={{ background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}30` }}>
                        {d.severity?.toUpperCase()}
                      </span>
                    </div>
                    <div className="disease-folder-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Folder size={12} /> datasets/{d.module || 'eye'}/{d.id}/
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
          );
        })}
      </div>

      <ConfirmModal
        {...confirmModal}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
