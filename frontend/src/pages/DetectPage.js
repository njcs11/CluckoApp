import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  MapPin, Compass, Search, X, ArrowRight, Eye, Feather,
  ShieldCheck, CheckCircle2, Cpu, Database, FlaskConical,
  ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import './DetectPage.css';

/* ─── Initial Seeded Davao City Gamefowl Farms (Instant Zero-Latency Paint) ─── */
const SEEDED_DAVAO_FARMS = [
  {
    id: 101,
    farm_name: 'Malagos Highland Gamefowl',
    owner_name: 'Carlos Mendoza',
    farm_location: 'Brgy. Malagos, Baguio District, Davao City',
    district: 'Baguio District',
    latitude: 7.1772,
    longitude: 125.4125,
    gamefowl_count: 48
  },
  {
    id: 102,
    farm_name: 'Calinan Gold Wing Gamefarm',
    owner_name: 'Roberto Duterte-Santos',
    farm_location: 'Brgy. Calinan Poblacion, Davao City',
    district: 'Calinan District',
    latitude: 7.1868,
    longitude: 125.4519,
    gamefowl_count: 64
  },
  {
    id: 103,
    farm_name: 'Toril Foothills Rooster Farm',
    owner_name: 'Engr. Marco Villamor',
    farm_location: 'Brgy. Eden, Toril, Davao City',
    district: 'Toril District',
    latitude: 7.0186,
    longitude: 125.4975,
    gamefowl_count: 52
  },
  {
    id: 104,
    farm_name: 'Mintal Heritage Gamefarm',
    owner_name: 'Antonio Reyes Jr.',
    farm_location: 'Brgy. Mintal, Tugbok, Davao City',
    district: 'Tugbok District',
    latitude: 7.0894,
    longitude: 125.5028,
    gamefowl_count: 38
  },
  {
    id: 105,
    farm_name: 'Catalunan Ridge Gamefarm',
    owner_name: 'Dr. Rafael Alcantara',
    farm_location: 'Brgy. Catalunan Grande, Talomo, Davao City',
    district: 'Talomo District',
    latitude: 7.0812,
    longitude: 125.5489,
    gamefowl_count: 75
  },
  {
    id: 106,
    farm_name: 'Mandug Valley Gamefowl',
    owner_name: 'Jericho Magbanua',
    farm_location: 'Brgy. Mandug, Buhangin, Davao City',
    district: 'Buhangin District',
    latitude: 7.1436,
    longitude: 125.5892,
    gamefowl_count: 42
  },
  {
    id: 107,
    farm_name: 'Lasang Coastal Gamefarm',
    owner_name: 'Vicente Soriano',
    farm_location: 'Brgy. Lasang, Bunawan, Davao City',
    district: 'Bunawan District',
    latitude: 7.2461,
    longitude: 125.6472,
    gamefowl_count: 31
  }
];

const DAVAO_DISTRICTS = [
  'All Districts',
  'Calinan District',
  'Toril District',
  'Tugbok District',
  'Talomo District',
  'Buhangin District',
  'Baguio District',
  'Bunawan District'
];

/* Project Davao City Geographic Lat/Lng (6.96..7.34 N, 125.32..125.68 E) onto SVG (820x510) */
function projectDavaoCoords(lat, lng) {
  const minLat = 6.96;
  const maxLat = 7.34;
  const minLng = 125.32;
  const maxLng = 125.68;

  const clampedLat = Math.max(minLat, Math.min(maxLat, Number(lat) || 7.10));
  const clampedLng = Math.max(minLng, Math.min(maxLng, Number(lng) || 125.52));

  const nx = (clampedLng - minLng) / (maxLng - minLng);
  const ny = 1 - (clampedLat - minLat) / (maxLat - minLat);

  const svgX = Math.round(115 + nx * 560);
  const svgY = Math.round(65 + ny * 380);
  return { x: svgX, y: svgY };
}

const ARCHITECTURE_PILLARS = {
  ocular: {
    title: 'Ocular Pathology Model (Eye Module)',
    description:
      'Trained specifically on gamefowl peri-ocular anatomy. Our multi-task convolutional neural network separates diffuse sinus and eyelid swelling from discrete cutaneous pox eruptions directly from learned convolutional features.',
    points: [
      'Infectious Coryza detection identifies periorbital sinus swelling, puffy eyelids, and watery tear-film reflections around the eye.',
      'Fowl Pox detection focuses on wart-like nodules and dark crusty scabs on the eyelids and peri-ocular skin around the eye.',
      'Multi-scale Grad-CAM++ activation maps are generated directly from the trained model layers to highlight the exact biological symptoms.'
    ],
    matrix: [
      {
        disease: 'Infectious Coryza',
        region: 'Around Eyes & Sinus',
        symptoms: ['Facial Swelling', 'Swollen Eyes', 'Watery Eyes']
      },
      {
        disease: 'Fowl Pox',
        region: 'Eyelids & Peri-Ocular Skin',
        symptoms: ['Wart-Like Nodules', 'Scabs']
      },
      {
        disease: 'Healthy Eye',
        region: 'Clear Ocular Ring',
        symptoms: ['Clear, Alert Healthy Eyes']
      }
    ]
  },
  postural: {
    title: 'Postural & Wing Biomechanics Model (Wing Module)',
    description:
      'Our custom Multi-Task MobileNetV2 Wing model evaluates full-body gamefowl posture, wing carriage symmetry, and horizontal body alignment to detect neurological and muscular wing droop.',
    points: [
      'Detects drooping wings and horizontal body axis imbalance across full-body gamefowl stances.',
      'Automatically adapts when a full-body bird with a drooping wing is captured so Newcastle Disease indicators are evaluated accurately.',
      'Model-driven Grad-CAM++ spans the bird’s torso and drooping wing feather line to visualize postural asymmetry.'
    ],
    matrix: [
      {
        disease: 'Newcastle Disease',
        region: 'Whole Body & Wing Line',
        symptoms: ['Drooping Wings', 'Imbalance']
      },
      {
        disease: 'Healthy Wing & Posture',
        region: 'Upright Athletic Stance',
        symptoms: ['Normal Upright Posture', 'Symmetrical Wings']
      }
    ]
  },
  gatekeeper: {
    title: '2-Stage Gatekeeper (Chicken & Gamefowl Verification)',
    description:
      'Protects users from false readings by running our two-stage neural verification pipeline before any disease classification is generated, paired with Super Auto-Focus on the mobile camera.',
    points: [
      'Stage 1 (Chicken Identification): Verifies that the captured photo contains a real live chicken and immediately rejects human faces, hands, and indoor objects.',
      'Stage 2 (Gamefowl Phenotype Verification): Evaluates lean athletic body structure, beak and leg proportions, arched tail plumage, and vascular facial skin to accept true gamefowl while rejecting plump commercial white broilers and uniform brown layer hens.',
      'Mobile Super Auto-Focus locks focus automatically when aimed at a bird, and gallery uploads are analyzed full-frame without forced cropping.'
    ],
    matrix: [
      {
        disease: 'Stage 1 Gatekeeper',
        region: 'Subject Presence Check',
        symptoms: ['Chicken vs. Non-Chicken Identification']
      },
      {
        disease: 'Stage 2 Gatekeeper',
        region: 'Phenotype & Posture Check',
        symptoms: ['Gamefowl vs. Commercial Poultry Verification']
      }
    ]
  }
};

export default function DetectPage() {
  const navigate = useNavigate();
  const mapSectionRef = useRef(null);
  const archSectionRef = useRef(null);

  const [farms, setFarms] = useState(SEEDED_DAVAO_FARMS);
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredFarmId, setHoveredFarmId] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [activeArchTab, setActiveArchTab] = useState('ocular');

  useEffect(() => {
    let mounted = true;
    axios
      .get('/api/farms/davao-map')
      .then((res) => {
        if (mounted && res.data && Array.isArray(res.data.farms) && res.data.farms.length > 0) {
          setFarms(res.data.farms);
        }
      })
      .catch(() => {
        /* Keep instant seeded Davao City farms on offline fallback */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredFarms = useMemo(() => {
    return farms.filter((f) => {
      const matchesDistrict =
        selectedDistrict === 'All Districts' ||
        (f.district && f.district.toLowerCase() === selectedDistrict.toLowerCase()) ||
        (f.farm_location && f.farm_location.toLowerCase().includes(selectedDistrict.replace(' District', '').toLowerCase()));

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (f.farm_name && f.farm_name.toLowerCase().includes(q)) ||
        (f.owner_name && f.owner_name.toLowerCase().includes(q)) ||
        (f.farm_location && f.farm_location.toLowerCase().includes(q));

      return matchesDistrict && matchesSearch;
    });
  }, [farms, selectedDistrict, searchQuery]);

  /* Only resolve activeFarm when the user is actively hovering a farm pin or directory item */
  const activeFarm = useMemo(() => {
    if (hoveredFarmId === null) return null;
    return (
      filteredFarms.find((f) => f.id === hoveredFarmId) ||
      farms.find((f) => f.id === hoveredFarmId) ||
      null
    );
  }, [filteredFarms, farms, hoveredFarmId]);

  const totalGamefowl = useMemo(() => {
    return farms.reduce((sum, f) => sum + (Number(f.gamefowl_count) || 0), 0);
  }, [farms]);

  /* Compute smart clamped position for the floating hover card inside the 820x510 map stage */
  const activeFarmProjected = useMemo(() => {
    if (!activeFarm) return { x: 410, y: 255, leftPct: 50, topPct: 45 };
    const pt = projectDavaoCoords(activeFarm.latitude, activeFarm.longitude);
    const leftPct = Math.max(6, Math.min(58, (pt.x / 820) * 100));
    const topPct = pt.y > 290 ? Math.max(8, (pt.y / 510) * 100 - 34) : Math.min(64, (pt.y / 510) * 100 + 6);
    return { ...pt, leftPct, topPct };
  }, [activeFarm]);

  const currentArch = ARCHITECTURE_PILLARS[activeArchTab] || ARCHITECTURE_PILLARS.ocular;

  const scrollToSection = (ref) => {
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="vs-landing">
      {/* ─── Top Bar: Context & Workspace Shortcuts ────────────────────────── */}
      <div className="vs-topbar">
        <div className="vs-topbar-brand">
          <span className="vs-topbar-dot" />
          <span className="vs-topbar-title">Clucko Vision Suite</span>
          <span className="vs-topbar-divider">•</span>
          <span className="vs-topbar-location">
            <MapPin size={14} color="#22c55e" />
            Davao City Gamefowl Farm Network
          </span>
        </div>

        <div className="vs-topbar-links">
          <button
            type="button"
            className="vs-nav-pill"
            onClick={() => scrollToSection(mapSectionRef)}
          >
            <Compass size={15} />
            <span>Davao Farm Map</span>
          </button>
          <button
            type="button"
            className="vs-nav-pill"
            onClick={() => scrollToSection(archSectionRef)}
          >
            <Eye size={15} />
            <span>AI Architecture</span>
          </button>
          <button
            type="button"
            className="vs-nav-pill"
            onClick={() => navigate('/diseases')}
          >
            <FlaskConical size={15} />
            <span>Diseases Library</span>
          </button>
          <button
            type="button"
            className="vs-nav-pill"
            onClick={() => navigate('/dataset')}
          >
            <Database size={15} />
            <span>Dataset Gallery</span>
          </button>
          <button
            type="button"
            className="vs-nav-pill vs-nav-pill-primary"
            onClick={() => navigate('/train')}
          >
            <Cpu size={15} />
            <span>Train Models</span>
          </button>
        </div>
      </div>

      {/* ─── Hero Section: Editorial Story + Live Flock Telemetry Digest ───── */}
      <section className="vs-hero-grid">
        <div className="vs-hero-intro">
          <div className="vs-hero-copy">
            <h1 className="vs-hero-heading">
              Precision Ocular &amp; Postural AI for{' '}
              <span className="vs-hero-heading-accent">Davao City Gamefowl Farms.</span>
            </h1>
            <p className="vs-hero-lead">
              Clucko safeguards gamefowl farms across Davao City with our custom dual-module
              MobileNetV2 neural network, model-driven Grad-CAM++ lesion localization, and
              two-stage gamefowl verification—identifying Infectious Coryza, Fowl Pox, and
              Newcastle Disease from field captures in seconds.
            </p>
            <div className="vs-hero-actions">
              <button
                type="button"
                className="vs-btn-primary"
                onClick={() => scrollToSection(mapSectionRef)}
              >
                <span>Explore Davao City Farm Map</span>
                <ArrowRight size={16} className="t-learn-icon" />
              </button>
              <button
                type="button"
                className="vs-btn-secondary"
                onClick={() => scrollToSection(archSectionRef)}
              >
                <span>How Clucko AI Works</span>
                <ArrowRight size={15} className="t-learn-icon" />
              </button>
            </div>
          </div>

          <div className="vs-hero-digest">
            <div className="vs-digest-header">
              <h2 className="vs-digest-title">Davao City Network Coverage</h2>
              <span className="vs-digest-badge">
                <ShieldCheck size={13} />
                Region XI Active
              </span>
            </div>
            <div className="vs-digest-rows">
              <div className="vs-digest-row">
                <span className="vs-digest-label">Registered Davao Gamefarms</span>
                <span className="vs-digest-val">{farms.length} Farms</span>
              </div>
              <div className="vs-digest-row">
                <span className="vs-digest-label">Total Monitored Gamefowl</span>
                <span className="vs-digest-val">{totalGamefowl} Gamefowl</span>
              </div>
              <div className="vs-digest-row">
                <span className="vs-digest-label">Diagnostic Scope</span>
                <span className="vs-digest-val">Coryza • Fowl Pox • Newcastle</span>
              </div>
            </div>
            <p className="vs-digest-note">
              Hover over any green farm pin on the Davao City map below to inspect the farm
              name, farm owner, and total number of gamefowl.
            </p>
          </div>
        </div>

        {/* ─── Centerpiece: Interactive Map of Davao City & User Farms ─────── */}
        <div className="vs-map-section" ref={mapSectionRef}>
          <div className="vs-map-header">
            <div className="vs-map-header-copy">
              <h2 className="vs-section-heading">
                Davao City Gamefowl Farm Map
              </h2>
              <p className="vs-section-sub">
                Interactive spatial directory of gamefowl farms registered by Clucko users across
                Davao City’s upland and coastal districts. Hover over any marker to view the
                farm name, owner, and number of gamefowl.
              </p>
            </div>

            <div className="vs-district-bar" role="tablist" aria-label="Filter Davao City Districts">
              {DAVAO_DISTRICTS.map((dist) => {
                const active = selectedDistrict === dist;
                const shortLabel = dist === 'All Districts' ? 'All Davao' : dist.replace(' District', '');
                return (
                  <button
                    key={dist}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`vs-district-btn ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedDistrict(dist)}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="vs-map-workspace">
            {/* Left/Center: Interactive Cartographic SVG Map of Davao City */}
            <div
              className="vs-map-stage"
              onMouseLeave={() => setHoveredFarmId(null)}
            >
              <div className="vs-map-HUD-top">
                <div className="vs-map-compass-badge">
                  <Compass size={14} color="#22c55e" />
                  <span>Davao City, Philippines (7.07° N, 125.61° E)</span>
                </div>

                <div className="vs-map-zoom-controls" aria-label="Map Zoom Controls">
                  <button
                    type="button"
                    className="vs-zoom-btn"
                    title="Zoom In"
                    aria-label="Zoom In"
                    onClick={() => setMapZoom((z) => Math.min(1.35, Number((z + 0.12).toFixed(2))))}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button
                    type="button"
                    className="vs-zoom-btn"
                    title="Zoom Out"
                    aria-label="Zoom Out"
                    onClick={() => setMapZoom((z) => Math.max(1.0, Number((z - 0.12).toFixed(2))))}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <button
                    type="button"
                    className="vs-zoom-btn"
                    title="Reset View"
                    aria-label="Reset View"
                    onClick={() => {
                      setMapZoom(1);
                      setSelectedDistrict('All Districts');
                      setHoveredFarmId(null);
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              <div className="vs-map-svg-wrap">
                <svg
                  viewBox="0 0 820 510"
                  className="vs-davao-svg"
                  style={{ transform: `scale(${mapZoom})` }}
                  role="img"
                  aria-label="Interactive Map of Davao City showing registered gamefowl farms"
                >
                  <defs>
                    <linearGradient id="davaoGulfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#121417" />
                      <stop offset="100%" stopColor="#0e1013" />
                    </linearGradient>
                    <linearGradient id="davaoLandGrad" x1="0%" y1="0%" x2="85%" y2="100%">
                      <stop offset="0%" stopColor="#1f232b" />
                      <stop offset="55%" stopColor="#1a1d24" />
                      <stop offset="100%" stopColor="#15181e" />
                    </linearGradient>
                    <pattern id="davaoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="rgba(34, 197, 94, 0.05)"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>

                  {/* Base Ocean (Davao Gulf) & Coordinate Grid */}
                  <rect width="820" height="510" fill="url(#davaoGulfGrad)" />
                  <rect width="820" height="510" fill="url(#davaoGrid)" />

                  {/* Davao City Mainland Cartographic Polygon */}
                  <path
                    d="M 55,25 L 485,20 L 665,65 L 690,145 L 645,215 L 605,260 L 560,315 L 515,375 L 465,445 L 420,490 L 65,490 L 35,340 L 40,165 Z"
                    fill="url(#davaoLandGrad)"
                    stroke="rgba(34, 197, 94, 0.30)"
                    strokeWidth="1.5"
                  />

                  {/* Samal Island (IGACOS) Across Pakiputan Strait in Davao Gulf */}
                  <path
                    d="M 675,210 L 745,195 L 775,245 L 765,335 L 710,365 L 675,320 L 665,255 Z"
                    fill="#171a20"
                    stroke="rgba(34, 197, 94, 0.18)"
                    strokeWidth="1.2"
                  />
                  <text x="722" y="282" fill="rgba(143, 148, 154, 0.45)" fontSize="10" fontWeight="600" textAnchor="middle">
                    SAMAL ISLAND
                  </text>
                  <text x="640" y="415" fill="rgba(143, 148, 154, 0.35)" fontSize="11" fontWeight="700" letterSpacing="2" textAnchor="middle">
                    DAVAO GULF
                  </text>

                  {/* Mt. Apo Highland Topographic Elevation Rings (Southwest Davao) */}
                  <ellipse
                    cx="155"
                    cy="415"
                    rx="95"
                    ry="65"
                    fill="none"
                    stroke="rgba(34, 197, 94, 0.09)"
                    strokeDasharray="4 4"
                  />
                  <ellipse
                    cx="155"
                    cy="415"
                    rx="58"
                    ry="38"
                    fill="none"
                    stroke="rgba(34, 197, 94, 0.14)"
                    strokeDasharray="3 3"
                  />
                  <text x="155" y="420" fill="rgba(143, 148, 154, 0.45)" fontSize="9.5" fontWeight="600" textAnchor="middle">
                    MT. APO HIGHLANDS
                  </text>

                  {/* Internal Davao City District Boundaries */}
                  <g stroke="rgba(255, 255, 255, 0.06)" strokeWidth="1" strokeDasharray="4 4" fill="none">
                    <path d="M 50,175 L 330,165 L 495,120" />
                    <path d="M 245,168 L 285,285 L 595,265" />
                    <path d="M 285,285 L 345,455" />
                    <path d="M 415,275 L 495,385" />
                    <path d="M 495,120 L 668,145" />
                  </g>

                  {/* Davao River & Talomo River Waterways */}
                  <path
                    d="M 195,95 Q 320,175 415,220 T 598,268"
                    fill="none"
                    stroke="rgba(34, 197, 94, 0.16)"
                    strokeWidth="2"
                  />
                  <path
                    d="M 255,315 Q 375,335 512,372"
                    fill="none"
                    stroke="rgba(34, 197, 94, 0.12)"
                    strokeWidth="1.5"
                  />

                  {/* Davao City District Labels */}
                  <g fill="rgba(192, 197, 206, 0.44)" fontSize="10.5" fontWeight="700" letterSpacing="0.06em">
                    <text x="165" y="105">MARILOG</text>
                    <text x="175" y="218">BAGUIO (MALAGOS)</text>
                    <text x="315" y="195">CALINAN</text>
                    <text x="325" y="305">TUGBOK (MINTAL)</text>
                    <text x="325" y="425">TORIL (EDEN)</text>
                    <text x="455" y="345">TALOMO</text>
                    <text x="535" y="235">BUHANGIN</text>
                    <text x="565" y="125">BUNAWAN</text>
                    <text x="558" y="292" fill="rgba(34, 197, 94, 0.55)" fontSize="10">POBLACION</text>
                  </g>

                  {/* Interactive Green Farm Markers inside Davao City */}
                  {filteredFarms.map((farm) => {
                    const pt = projectDavaoCoords(farm.latitude, farm.longitude);
                    const isSelected = activeFarm && activeFarm.id === farm.id;
                    const pinColor = isSelected ? '#4ade80' : '#22c55e';
                    const pinStroke = isSelected ? '#ffffff' : '#121417';

                    return (
                      <g
                        key={farm.id}
                        className={`vs-farm-pin-group ${isSelected ? 'is-selected' : ''}`}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${farm.farm_name}, owned by ${farm.owner_name}, ${farm.gamefowl_count} gamefowl`}
                        onMouseEnter={() => setHoveredFarmId(farm.id)}
                        onMouseLeave={() => setHoveredFarmId(null)}
                        onFocus={() => setHoveredFarmId(farm.id)}
                        onBlur={() => setHoveredFarmId(null)}
                      >
                        {/* Generous 44x44px invisible hover hit target */}
                        <circle r="22" fill="transparent" />

                        {/* Outer Radar Pulse Ring (Green Only) */}
                        <circle
                          r={isSelected ? '18' : '14'}
                          fill="#22c55e"
                          className="vs-pin-pulse"
                        />

                        {/* Hovered Halo Ring */}
                        {isSelected && (
                          <circle
                            r="16"
                            fill="none"
                            stroke="#4ade80"
                            strokeWidth="2"
                          />
                        )}

                        {/* Core Green Marker Pin */}
                        <circle
                          r={isSelected ? '9.5' : '8'}
                          fill={pinColor}
                          stroke={pinStroke}
                          strokeWidth="2.2"
                          className="vs-pin-core"
                        />

                        {/* Pill Label Showing Farm Short Name + Gamefowl Count */}
                        <g transform="translate(0, -16)">
                          <rect
                            x="-56"
                            y="-20"
                            width="112"
                            height="18"
                            rx="5"
                            fill={isSelected ? '#22c55e' : 'rgba(23, 25, 30, 0.94)'}
                            stroke={isSelected ? '#ffffff' : 'rgba(34, 197, 94, 0.45)'}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="-8"
                            textAnchor="middle"
                            fill={isSelected ? '#09140e' : '#f3f4f6'}
                            fontSize="9.5"
                            fontWeight="700"
                          >
                            {farm.farm_name.length > 13
                              ? `${farm.farm_name.slice(0, 12)}…`
                              : farm.farm_name}{' '}
                            ({farm.gamefowl_count})
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>

                {/* Floating Hover Telemetry Card — Shown ONLY When Hovering a Farm Pin */}
                {activeFarm && (
                  <div
                    className="vs-map-hover-card is-open"
                    style={{
                      left: `${activeFarmProjected.leftPct}%`,
                      top: `${activeFarmProjected.topPct}%`
                    }}
                    role="region"
                    aria-live="polite"
                  >
                    <div className="vs-hover-card-top">
                      <h3 className="vs-hover-farm-name">{activeFarm.farm_name}</h3>
                    </div>

                    <div className="vs-hover-meta-grid">
                      <div className="vs-hover-meta-item">
                        <span className="vs-hover-meta-label">Farm Owner</span>
                        <span className="vs-hover-meta-value">{activeFarm.owner_name}</span>
                      </div>
                      <div className="vs-hover-meta-item">
                        <span className="vs-hover-meta-label">Number of Gamefowl</span>
                        <span className="vs-hover-meta-value is-emerald">
                          {activeFarm.gamefowl_count} Gamefowl
                        </span>
                      </div>
                    </div>

                    <div className="vs-hover-location-row">
                      <MapPin size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <span>{activeFarm.farm_location}</span>
                        <span className="vs-hover-coords">
                          {Number(activeFarm.latitude).toFixed(4)}° N,{' '}
                          {Number(activeFarm.longitude).toFixed(4)}° E
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Rail: Synchronized Davao City Farm Directory */}
            <aside className="vs-farm-rail" aria-label="Davao City Registered Farms List">
              <div className="vs-rail-header">
                <h3 className="vs-rail-title">Davao Farm Directory</h3>
                <span className="vs-rail-count">
                  {filteredFarms.length} {filteredFarms.length === 1 ? 'Farm' : 'Farms'}
                </span>
              </div>

              <div className="vs-rail-search">
                <Search size={14} className="vs-rail-search-icon" />
                <input
                  type="text"
                  className="vs-rail-search-input"
                  placeholder="Search farm, owner, or barangay..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="vs-rail-clear-btn"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="vs-rail-list">
                {filteredFarms.map((farm) => {
                  const isActive = activeFarm && activeFarm.id === farm.id;
                  return (
                    <button
                      key={farm.id}
                      type="button"
                      className={`vs-farm-item ${isActive ? 'is-active' : ''}`}
                      onMouseEnter={() => setHoveredFarmId(farm.id)}
                      onMouseLeave={() => setHoveredFarmId(null)}
                      onFocus={() => setHoveredFarmId(farm.id)}
                      onBlur={() => setHoveredFarmId(null)}
                    >
                      <div className="vs-farm-item-top">
                        <span className="vs-farm-item-name">{farm.farm_name}</span>
                        <span className="vs-farm-item-flock">
                          {farm.gamefowl_count} Gamefowl
                        </span>
                      </div>
                      <div className="vs-farm-item-owner">Owner: {farm.owner_name}</div>
                      <div className="vs-farm-item-loc">
                        <MapPin size={12} color="#22c55e" />
                        <span>{farm.farm_location}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ─── Section 2: About Clucko — Dual-Module Neural Architecture ─────── */}
      <section className="vs-architecture-section" ref={archSectionRef}>
        <div className="vs-arch-header">
          <div>
            <h2 className="vs-section-heading">
              How Clucko Protects Gamefowl Flocks
            </h2>
            <p className="vs-section-sub">
              Built around our custom multi-task anatomical models and two-stage verification
              gatekeeper, ensuring every diagnosis is grounded in verified clinical symptoms.
            </p>
          </div>

          <div className="vs-arch-tabs" role="tablist" aria-label="Clucko AI Architecture Pillars">
            <button
              type="button"
              role="tab"
              aria-selected={activeArchTab === 'ocular'}
              className={`vs-arch-tab ${activeArchTab === 'ocular' ? 'is-active' : ''}`}
              onClick={() => setActiveArchTab('ocular')}
            >
              <Eye size={15} />
              <span>Ocular AI (Eye Module)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeArchTab === 'postural'}
              className={`vs-arch-tab ${activeArchTab === 'postural' ? 'is-active' : ''}`}
              onClick={() => setActiveArchTab('postural')}
            >
              <Feather size={15} />
              <span>Postural AI (Wing Module)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeArchTab === 'gatekeeper'}
              className={`vs-arch-tab ${activeArchTab === 'gatekeeper' ? 'is-active' : ''}`}
              onClick={() => setActiveArchTab('gatekeeper')}
            >
              <ShieldCheck size={15} />
              <span>2-Stage Gatekeeper</span>
            </button>
          </div>
        </div>

        <div className="vs-arch-stage">
          <div className="vs-arch-copy">
            <div>
              <h3 className="vs-arch-title">{currentArch.title}</h3>
              <p className="vs-arch-desc">{currentArch.description}</p>
            </div>

            <ul className="vs-arch-points">
              {currentArch.points.map((pt, idx) => (
                <li key={idx} className="vs-arch-point">
                  <CheckCircle2 size={17} className="vs-arch-point-icon" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>

            <div className="vs-hero-actions">
              <button
                type="button"
                className="vs-btn-primary"
                onClick={() => navigate('/diseases')}
              >
                <span>Inspect Disease Symptom Matrix</span>
                <ArrowRight size={15} className="t-learn-icon" />
              </button>
              <button
                type="button"
                className="vs-btn-secondary"
                onClick={() => navigate('/dataset')}
              >
                <span>Browse Training Dataset</span>
                <ArrowRight size={15} className="t-learn-icon" />
              </button>
            </div>
          </div>

          <div className="vs-arch-spec-panel">
            <div className="vs-spec-panel-head">
              Finalized Multi-Task Symptom Signatures
            </div>
            <div className="vs-symptom-matrix">
              {currentArch.matrix.map((row) => (
                <div key={row.disease} className="vs-symptom-group">
                  <div className="vs-symptom-group-head">
                    <span className="vs-symptom-disease">{row.disease}</span>
                    <span className="vs-symptom-region">{row.region}</span>
                  </div>
                  <div className="vs-symptom-tags">
                    {row.symptoms.map((sym) => (
                      <span key={sym} className="vs-symptom-tag">
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
