import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { VisionSuiteSkeleton } from '../components/SkeletonLoader';
import {
  MapPin, Compass, Search, X, ArrowRight, Eye, Feather,
  ShieldCheck, CheckCircle2, Cpu, Database, FlaskConical,
  ZoomIn, ZoomOut, RotateCcw, Layers, Globe, Mountain
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
  },
  {
    id: 108,
    farm_name: 'Buda Alpine Rooster Ridge',
    owner_name: 'Datu Ronald Matigsalug',
    farm_location: 'Brgy. Buda, Marilog District, Davao City',
    district: 'Marilog District',
    latitude: 7.3621,
    longitude: 125.2914,
    gamefowl_count: 55
  },
  {
    id: 109,
    farm_name: 'Paquibato Sun Valley Farm',
    owner_name: 'Col. Dante Alimurung',
    farm_location: 'Brgy. Malabog, Paquibato District, Davao City',
    district: 'Paquibato District',
    latitude: 7.3815,
    longitude: 125.5120,
    gamefowl_count: 46
  }
];

const DAVAO_DISTRICTS = [
  'All Districts',
  'Marilog District',
  'Paquibato District',
  'Calinan District',
  'Baguio District',
  'Tugbok District',
  'Toril District',
  'Talomo District',
  'Buhangin District',
  'Bunawan District',
  'Poblacion District',
  'Agdao District'
];

/* Project Davao City Geographic Lat/Lng (6.92..7.60 N, 125.16..125.74 E) onto SVG (860x560) */
function projectDavaoCoords(lat, lng) {
  const minLat = 6.92;
  const maxLat = 7.60;
  const minLng = 125.16;
  const maxLng = 125.74;

  const clampedLat = Math.max(minLat, Math.min(maxLat, Number(lat) || 7.15));
  const clampedLng = Math.max(minLng, Math.min(maxLng, Number(lng) || 125.50));

  const nx = (clampedLng - minLng) / (maxLng - minLng);
  const ny = 1 - (clampedLat - minLat) / (maxLat - minLat);

  const padX = 40;
  const padY = 25;
  const drawW = 860 - padX * 2;
  const drawH = 560 - padY * 2;

  const svgX = Math.round((padX + nx * drawW) * 10) / 10;
  const svgY = Math.round((padY + ny * drawH) * 10) / 10;
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
  const [loadingMap, setLoadingMap] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredFarmId, setHoveredFarmId] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapMode, setMapMode] = useState('satellite'); // 'satellite' | 'terrain' | 'roadmap'
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
      })
      .finally(() => {
        if (mounted) {
          setTimeout(() => {
            if (mounted) setLoadingMap(false);
          }, 350);
        }
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

  /* Compute smart clamped position for the floating hover card inside the 860x560 map stage */
  const activeFarmProjected = useMemo(() => {
    if (!activeFarm) return { x: 430, y: 280, leftPct: 50, topPct: 45 };
    const pt = projectDavaoCoords(activeFarm.latitude, activeFarm.longitude);
    const leftPct = Math.max(6, Math.min(58, (pt.x / 860) * 100));
    const topPct = pt.y > 300 ? Math.max(8, (pt.y / 560) * 100 - 34) : Math.min(64, (pt.y / 560) * 100 + 6);
    return { ...pt, leftPct, topPct };
  }, [activeFarm]);

  const currentArch = ARCHITECTURE_PILLARS[activeArchTab] || ARCHITECTURE_PILLARS.ocular;

  const scrollToSection = (ref) => {
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loadingMap) {
    return <VisionSuiteSkeleton />;
  }

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
                  <span>Davao City, Philippines</span>
                </div>

                <div className="vs-map-zoom-controls" aria-label="Map Zoom Controls">
                  <button
                    type="button"
                    className="vs-zoom-btn"
                    title="Zoom In"
                    aria-label="Zoom In"
                    onClick={() => setMapZoom((z) => Math.min(1.45, Number((z + 0.12).toFixed(2))))}
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

              <div className={`vs-map-svg-wrap vs-mode-${mapMode}`}>
                <svg
                  viewBox="0 0 860 560"
                  className="vs-davao-svg"
                  style={{ transform: `scale(${mapZoom})` }}
                  role="img"
                  aria-label="Accurate Geographic Map of Davao City Territory showing 11 districts and registered farms"
                >
                  <defs>
                    {/* Google Satellite Water Texture */}
                    <linearGradient id="gmapOceanSat" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1e3b62" />
                      <stop offset="60%" stopColor="#152e4d" />
                      <stop offset="100%" stopColor="#0e2137" />
                    </linearGradient>

                    {/* Google Roadmap / Terrain Water */}
                    <linearGradient id="gmapOceanRoad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a3c4ed" />
                      <stop offset="100%" stopColor="#87addb" />
                    </linearGradient>

                    {/* Satellite Lush Highland Terrain */}
                    <linearGradient id="gmapSatHighland" x1="0%" y1="0%" x2="80%" y2="100%">
                      <stop offset="0%" stopColor="#254728" />
                      <stop offset="50%" stopColor="#2e5430" />
                      <stop offset="100%" stopColor="#3d6439" />
                    </linearGradient>

                    {/* Satellite Valley & Coastal Agricultural Terrain */}
                    <linearGradient id="gmapSatValley" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#385b34" />
                      <stop offset="60%" stopColor="#486e42" />
                      <stop offset="100%" stopColor="#5a7e4e" />
                    </linearGradient>

                    {/* Emerald Perimeter Glow Filter */}
                    <filter id="emeraldPerimeterGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#22c55e" floodOpacity="0.75" />
                    </filter>

                    <filter id="pinShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.45" />
                    </filter>
                  </defs>

                  {/* 1. Base Ocean (Davao Gulf & Pakiputan Strait) */}
                  <rect
                    width="860"
                    height="560"
                    fill={mapMode === 'satellite' ? 'url(#gmapOceanSat)' : 'url(#gmapOceanRoad)'}
                  />

                  {/* 2. Surrounding Mindanao Provinces (Muted Real Geography Context) */}
                  <g className="vs-surrounding-territory">
                    {/* Northern Bukidnon & Davao del Norte landmass */}
                    <path
                      d="M 0,0 L 860,0 L 860,265 L 645,265 L 665,227 L 665,40 L 73,40 L 73,0 Z"
                      fill={mapMode === 'satellite' ? '#18241a' : '#eae5dd'}
                      opacity={mapMode === 'satellite' ? '0.75' : '0.90'}
                    />
                    {/* Western Cotabato landmass */}
                    <path
                      d="M 0,0 L 73,0 L 73,310 L 93,415 L 114,452 L 134,486 L 0,486 Z"
                      fill={mapMode === 'satellite' ? '#162017' : '#e6e1d7'}
                      opacity={mapMode === 'satellite' ? '0.75' : '0.90'}
                    />
                    {/* Southern Davao del Sur landmass */}
                    <path
                      d="M 0,486 L 134,486 L 174,518 L 295,521 L 477,521 L 477,560 L 0,560 Z"
                      fill={mapMode === 'satellite' ? '#172218' : '#e4dfd5'}
                      opacity={mapMode === 'satellite' ? '0.75' : '0.90'}
                    />

                    {/* Neighboring Territory Labels */}
                    <text x="490" y="24" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.30)' : '#78716c'} fontSize="10.5" fontWeight="700" letterSpacing="0.1em">
                      BUKIDNON / DAVAO DEL NORTE
                    </text>
                    <text x="18" y="240" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.26)' : '#78716c'} fontSize="10" fontWeight="700" letterSpacing="0.08em" transform="rotate(-90 18,240)">
                      NORTH COTABATO
                    </text>
                    <text x="210" y="546" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.26)' : '#78716c'} fontSize="10.5" fontWeight="700" letterSpacing="0.1em">
                      DAVAO DEL SUR (SANTA CRUZ)
                    </text>
                    <text x="680" y="515" fill={mapMode === 'satellite' ? 'rgba(147,197,253,0.40)' : '#3b82f6'} fontSize="12" fontWeight="800" letterSpacing="0.18em">
                      DAVAO GULF
                    </text>
                  </g>

                  {/* 3. Samal Island (IGACOS) Across Pakiputan Strait */}
                  <g className="vs-samal-island">
                    <path
                      d="M 720,335 L 755,315 L 778,350 L 785,420 L 748,460 L 725,415 L 712,365 Z"
                      fill={mapMode === 'satellite' ? '#2d4b29' : '#d2e3c8'}
                      stroke={mapMode === 'satellite' ? 'rgba(34,197,94,0.35)' : '#94a3b8'}
                      strokeWidth="1.2"
                    />
                    <text x="750" y="390" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.65)' : '#475569'} fontSize="9" fontWeight="700" textAnchor="middle" letterSpacing="0.06em">
                      SAMAL ISLAND
                    </text>
                    <text x="750" y="402" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.45)' : '#64748b'} fontSize="7.5" fontWeight="600" textAnchor="middle">
                      (IGACOS)
                    </text>
                  </g>

                  {/* 4. Official Davao City 11 Administrative Districts (Matching Pic 3) */}
                  <g className="vs-davao-districts-group">
                    {/* Marilog District (Northwest) */}
                    <path
                      d="M 73.6,40.0 L 376.2,40.0 L 376.2,295.0 L 255.2,310.0 L 73.6,310.0 Z"
                      fill={mapMode === 'satellite' ? 'url(#gmapSatHighland)' : '#e0eaf6'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Paquibato District (Northeast) */}
                    <path
                      d="M 376.2,40.0 L 665.3,40.0 L 665.3,137.5 L 665.3,227.5 L 645.2,265.0 L 551.0,287.5 L 376.2,295.0 Z"
                      fill={mapMode === 'satellite' ? '#2e4e2a' : '#faebe3'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Baguio District (West) */}
                    <path
                      d="M 73.6,310.0 L 255.2,310.0 L 349.3,370.0 L 322.4,407.5 L 93.8,415.0 L 93.8,370.0 Z"
                      fill={mapMode === 'satellite' ? '#33572d' : '#e2f0d9'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Calinan District (Central) */}
                    <path
                      d="M 255.2,310.0 L 376.2,295.0 L 551.0,287.5 L 524.1,370.0 L 389.7,385.0 L 349.3,370.0 Z"
                      fill={mapMode === 'satellite' ? 'url(#gmapSatValley)' : '#fff3cd'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Tugbok District (Central-South) */}
                    <path
                      d="M 349.3,370.0 L 389.7,385.0 L 524.1,370.0 L 537.6,422.5 L 416.6,445.0 L 322.4,407.5 Z"
                      fill={mapMode === 'satellite' ? '#3c6035' : '#faeed7'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Toril District (South) */}
                    <path
                      d="M 93.8,415.0 L 322.4,407.5 L 416.6,445.0 L 537.6,422.5 L 524.1,467.5 L 517.4,478.7 L 490.5,508.7 L 477.1,521.5 L 295.5,521.5 L 174.5,518.5 L 134.1,486.2 L 114.0,452.5 Z"
                      fill={mapMode === 'satellite' ? '#2a4927' : '#ece5f3'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Talomo District (South Coast) */}
                    <path
                      d="M 537.6,422.5 L 604.8,400.0 L 618.3,426.2 L 584.7,441.2 L 557.8,456.2 L 524.1,467.5 Z"
                      fill={mapMode === 'satellite' ? '#46683c' : '#fef8d3'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Buhangin District (East-Central) */}
                    <path
                      d="M 551.0,287.5 L 705.7,347.5 L 692.2,377.5 L 678.8,400.0 L 658.6,407.5 L 604.8,400.0 L 524.1,370.0 Z"
                      fill={mapMode === 'satellite' ? '#3f6236' : '#e0f2e9'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Bunawan District (Northeast Coast) */}
                    <path
                      d="M 645.2,265.0 L 725.9,272.5 L 705.7,302.5 L 705.7,347.5 L 551.0,287.5 Z"
                      fill={mapMode === 'satellite' ? '#375730' : '#dcf0fa'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.14)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Poblacion District (City Center Waterfront - District 1) */}
                    <path
                      d="M 604.8,400.0 L 651.9,407.5 L 651.9,422.5 L 618.3,426.2 Z"
                      fill={mapMode === 'satellite' ? '#5a784e' : '#f9dbdb'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.18)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    {/* Agdao District (Harbor Coast - District 2) */}
                    <path
                      d="M 651.9,407.5 L 678.8,400.0 L 665.3,411.2 L 651.9,422.5 Z"
                      fill={mapMode === 'satellite' ? '#55724b' : '#fae4cd'}
                      stroke={mapMode === 'satellite' ? 'rgba(255,255,255,0.18)' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                  </g>

                  {/* 5. Geographic Landmarks: Rivers & Mountain Peaks */}
                  <g className="vs-geography-layers">
                    {/* Davao River Winding from Marilog through Calinan to Davao Gulf */}
                    <path
                      d="M 210,140 Q 320,210 376,280 T 524,370 Q 580,395 625,420"
                      fill="none"
                      stroke={mapMode === 'satellite' ? '#38bdf8' : '#60a5fa'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {/* Tamugan / Talomo River */}
                    <path
                      d="M 330,340 Q 420,380 475,410 T 560,455"
                      fill="none"
                      stroke={mapMode === 'satellite' ? '#38bdf8' : '#60a5fa'}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />

                    {/* Mt. Apo Peak (2,954m Highest Peak in Philippines) in Southwest Toril */}
                    <g transform="translate(138, 486)">
                      <circle r="18" fill="none" stroke="rgba(239, 68, 68, 0.40)" strokeDasharray="3 3" />
                      <circle r="9" fill="rgba(239, 68, 68, 0.20)" />
                      <circle r="3.5" fill="#ef4444" />
                      <text x="14" y="4" fill={mapMode === 'satellite' ? '#fca5a5' : '#b91c1c'} fontSize="8.5" fontWeight="800">

                      </text>
                    </g>

                    {/* Pan-Philippine Highway AH26 (Coastal Corridor) */}
                    <path
                      d="M 725,273 L 705,305 L 705,348 L 680,400 L 652,422 L 585,441 L 517,479 L 477,521"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    />
                    {/* Davao-Bukidnon Road (Route 75) */}
                    <path
                      d="M 640,420 L 524,370 L 380,335 L 255,300 L 160,180 L 110,90"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.0"
                      strokeLinecap="round"
                      strokeDasharray="5 3"
                    />
                  </g>

                  {/* 6. Official 11 District Text Labels (Pic 3 Reference) */}
                  <g className="vs-district-labels" fill={mapMode === 'satellite' ? 'rgba(255,255,255,0.72)' : '#334155'} fontSize="9.5" fontWeight="800" letterSpacing="0.06em">
                    <text x="215" y="170" textAnchor="middle">MARILOG</text>
                    <text x="515" y="160" textAnchor="middle">PAQUIBATO</text>
                    <text x="190" y="365" textAnchor="middle">BAGUIO</text>
                    <text x="380" y="340" textAnchor="middle">CALINAN</text>
                    <text x="430" y="410" textAnchor="middle">TUGBOK</text>
                    <text x="300" y="475" textAnchor="middle">TORIL</text>
                    <text x="575" y="435" textAnchor="middle">TALOMO</text>
                    <text x="635" y="360" textAnchor="middle">BUHANGIN</text>
                    <text x="665" y="310" textAnchor="middle">BUNAWAN</text>
                    <text x="632" y="415" textAnchor="middle" fill="#86efac" fontSize="8">POBLACION (1)</text>
                    <text x="665" y="412" textAnchor="middle" fill="#f97316" fontSize="7.5"></text>
                  </g>

                  {/* 7. Official Emerald Geographic Perimeter Line */}
                  <path
                    d="M 73.6,40.0 L 403.1,40.0 L 665.3,40.0 L 665.3,137.5 L 665.3,227.5 L 645.2,265.0 L 725.9,272.5 L 705.7,302.5 L 705.7,347.5 L 692.2,377.5 L 678.8,400.0 L 665.3,411.2 L 651.9,422.5 L 584.7,441.2 L 557.8,456.2 L 517.4,478.7 L 490.5,508.7 L 477.1,521.5 L 295.5,521.5 L 174.5,518.5 L 134.1,486.2 L 114.0,452.5 L 93.8,400.0 L 93.8,340.0 L 80.3,287.5 L 73.6,205.0 L 73.6,115.0 L 73.6,40.0 Z"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.8"
                    filter="url(#emeraldPerimeterGlow)"
                  />

                  {/* 8. Interactive Gamefowl Farm Pins */}
                  {filteredFarms.map((farm) => {
                    const pt = projectDavaoCoords(farm.latitude, farm.longitude);
                    const isSelected = activeFarm && activeFarm.id === farm.id;
                    const pinColor = isSelected ? '#22c55e' : '#16a34a';

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
                        {/* 44x44px touch hit area */}
                        <circle r="22" fill="transparent" />

                        {/* Radar Pulse Ring */}
                        <circle
                          r={isSelected ? '19' : '13'}
                          fill="#22c55e"
                          className="vs-pin-pulse"
                        />

                        {/* Google Maps Style Marker Pin Shape */}
                        <g filter="url(#pinShadow)">
                          <path
                            d="M 0,0 C -6,-6 -9,-11 -9,-16 C -9,-21 -5,-25 0,-25 C 5,-25 9,-21 9,-16 C 9,-11 6,-6 0,0 Z"
                            fill={isSelected ? '#22c55e' : '#15803d'}
                            stroke="#ffffff"
                            strokeWidth="1.6"
                          />
                          <circle cx="0" cy="-16" r="3.2" fill="#ffffff" />
                        </g>

                        {/* Farm Name Pill Label */}
                        <g transform="translate(0, -32)">
                          <rect
                            x="-58"
                            y="-16"
                            width="116"
                            height="16"
                            rx="4"
                            fill={isSelected ? '#15803d' : 'rgba(15, 23, 42, 0.92)'}
                            stroke={isSelected ? '#ffffff' : 'rgba(34, 197, 94, 0.40)'}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="-5"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="8.5"
                            fontWeight="700"
                          >
                            {farm.farm_name.length > 14
                              ? `${farm.farm_name.slice(0, 13)}…`
                              : farm.farm_name}{' '}
                            ({farm.gamefowl_count})
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* Google Maps Scale Bar at Bottom Right */}
                  <g transform="translate(710, 535)">
                    <rect x="0" y="0" width="125" height="16" rx="3" fill="rgba(15, 23, 42, 0.82)" />
                    <line x1="12" y1="10" x2="65" y2="10" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="12" y1="6" x2="12" y2="14" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="65" y1="6" x2="65" y2="14" stroke="#ffffff" strokeWidth="2.5" />
                    <text x="74" y="12" fill="#f8fafc" fontSize="8.5" fontWeight="700">
                      10 km
                    </text>
                  </g>
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
