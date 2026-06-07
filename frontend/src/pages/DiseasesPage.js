import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import './DiseasesPage.css';

const SEVERITY_OPTIONS = ['none', 'moderate', 'high', 'critical'];
const PARTS_OPTIONS = ['eye', 'wing', 'posture', 'skin', 'comb', 'all'];
const COLORS = ['#4ade80','#fbbf24','#fb923c','#f87171','#60a5fa','#a78bfa','#f472b6','#34d399'];

const DEFAULT_SYMPTOMS = {
  eye: ['watery_eyes','swollen_eyes','nasal_discharge','facial_swelling','eye_lesions','cloudy_eye'],
  wing: ['drooping_wings','severe_droop','wing_weakness'],
  skin: ['skin_lesions','scabs'],
  comb: ['comb_discoloration','pale_comb'],
  posture: ['twisted_neck','lethargic_stance','imbalance'],
  all: ['normal_eye','normal_posture','symmetrical_wings']
};

export default function DiseasesPage() {
  const [diseases, setDiseases] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', symptoms: [], affected_parts: [], severity: 'moderate', color: COLORS[1]
  });
  const [symptomInput, setSymptomInput] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const { data } = await axios.get('/api/diseases');
    setDiseases(data.diseases);
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

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Disease name required'); return; }
    try {
      await axios.post('/api/diseases', form);
      toast.success(`${form.name} added!`);
      setShowForm(false);
      setForm({ name: '', description: '', symptoms: [], affected_parts: [], severity: 'moderate', color: COLORS[1] });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add disease');
    }
  };

  const deleteDis = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await axios.delete(`/api/diseases/${id}`);
    toast.success('Deleted');
    load();
  };

  const severityColor = { none: '#4ade80', moderate: '#fbbf24', high: '#fb923c', critical: '#f87171' };

  return (
    <div className="page">
      <div className="page-header" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div>
          <h1 className="page-title">Disease Library</h1>
          <p className="page-subtitle">Manage diseases the AI can detect — add new ones dynamically</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add Disease
        </button>
      </div>

      {/* Add Disease Form */}
      {showForm && (
        <div className="card add-form animate-in" style={{marginBottom: 24}}>
          <div className="card-title">Add New Disease</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Disease Name *</label>
              <input value={form.name} onChange={e => setForm(f=>({...f, name: e.target.value}))} placeholder="e.g. Marek's Disease" />
            </div>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select value={form.severity} onChange={e => setForm(f=>({...f, severity: e.target.value}))}>
                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea value={form.description} onChange={e => setForm(f=>({...f, description: e.target.value}))}
              rows={2} placeholder="Brief description of this disease..." style={{resize:'vertical'}} />
          </div>

          <div className="form-group">
            <label className="form-label">Color Tag</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <button key={c} className={`color-dot ${form.color === c ? 'selected' : ''}`}
                  style={{background: c}} onClick={() => setForm(f => ({...f, color: c}))} />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Affected Body Parts</label>
            <div className="chip-row">
              {PARTS_OPTIONS.map(p => (
                <button key={p}
                  className={`chip ${form.affected_parts.includes(p) ? 'chip-active' : ''}`}
                  onClick={() => { togglePart(p); addSuggestedSymptoms(p); }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Symptoms (visible signs)</label>
            <div className="symptom-input-row">
              <input value={symptomInput} onChange={e => setSymptomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSymptom(symptomInput)}
                placeholder="Type symptom and press Enter (e.g. swollen_face)" />
              <button className="btn btn-secondary" onClick={() => addSymptom(symptomInput)}>Add</button>
            </div>
            <div className="chip-row" style={{marginTop: 8}}>
              {form.symptoms.map(s => (
                <span key={s} className="chip chip-active chip-removable">
                  {s.replace(/_/g, ' ')}
                  <button onClick={() => removeSymptom(s)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div style={{display:'flex', gap: 10, marginTop: 8}}>
            <button className="btn btn-primary" onClick={submit}><Plus size={16}/> Save Disease</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Disease List */}
      <div className="diseases-list">
        {diseases.map(d => (
          <div key={d.id} className="card disease-card" style={{borderLeftColor: d.color, borderLeftWidth: 4}}>
            <div className="disease-header" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <div className="disease-info">
                <FlaskConical size={16} color={d.color} />
                <span className="disease-name">{d.name}</span>
                <span className="tag" style={{background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}30`}}>
                  {d.severity}
                </span>
              </div>
              <div style={{display:'flex', alignItems:'center', gap: 8}}>
                <button className="btn btn-danger" style={{padding:'6px 10px'}} onClick={e => {e.stopPropagation(); deleteDis(d.id, d.name);}}>
                  <Trash2 size={14} />
                </button>
                {expanded === d.id ? <ChevronUp size={16} color="#4a6a4a" /> : <ChevronDown size={16} color="#4a6a4a" />}
              </div>
            </div>

            {expanded === d.id && (
              <div className="disease-details animate-in">
                <p className="disease-desc">{d.description || 'No description.'}</p>
                <div style={{marginTop: 12}}>
                  <div className="form-label">Affected Parts</div>
                  <div className="chip-row">
                    {d.affected_parts.map(p => <span key={p} className="chip chip-active">{p}</span>)}
                  </div>
                </div>
                <div style={{marginTop: 12}}>
                  <div className="form-label">Symptoms / Visual Signs</div>
                  <div className="chip-row">
                    {d.symptoms.map(s => (
                      <span key={s} className="symptom-chip" style={{fontSize:12}}>
                        <span className="symptom-dot" />
                        {s.replace(/_/g,' ')}
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
