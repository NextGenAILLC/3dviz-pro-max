/**
 * Dynamic synthetic recovery and injury-prevention telemetry engine for the
 * Tactical & Athletic Physiology Lens modules. All outputs are strictly
 * synthetic and redacted (zero PHI/HIPAA ingestion).
 */

const LOAD_STATES = {
  baseline: {
    id: 'baseline',
    label: 'Baseline Recovery',
    bpm: 62,
    tone: 'nominal',
    strainFactor: 0,
  },
  stress: {
    id: 'stress',
    label: 'Developer Stress',
    bpm: 96,
    tone: 'moderate',
    strainFactor: 1,
  },
  'sleep-debt': {
    id: 'sleep-debt',
    label: '72h Sleep Debt',
    bpm: 118,
    tone: 'elevated',
    strainFactor: 2,
  },
  tactical: {
    id: 'tactical',
    label: 'Tactical Peak',
    bpm: 142,
    tone: 'critical',
    strainFactor: 3,
  },
};

const MODULE_TELEMETRY = {
  'cardiac-persistence': {
    title: 'Cardiac Persistence & Sleep Debt',
    riskLabel: 'Diastolic Fill',
    byProfile: {
      baseline: {
        readinessPct: 95,
        recoveryWindow: '6–10 h',
        riskValue: '610 ms',
        tacticalImpact:
          'Balanced vagal tone maintains a full diastolic filling window, keeping resting coronary oxygen demand low and stroke efficiency high.',
        injuryPrevention:
          'Preserve parasympathetic reserve with regular sleep regularity and light aerobic flush sessions between sustained cognitive sprints.',
      },
      stress: {
        readinessPct: 74,
        recoveryWindow: '18–24 h',
        riskValue: '340 ms',
        tacticalImpact:
          'Sustained sympathetic elevation compresses diastolic perfusion time while keeping myocardial work elevated even at rest.',
        injuryPrevention:
          'Insert 90-minute micro-recovery pauses with slow nasal exhalations to interrupt persistent catecholamine buildup.',
      },
      'sleep-debt': {
        readinessPct: 48,
        recoveryWindow: '48–72 h',
        riskValue: '245 ms',
        tacticalImpact:
          '72 hours of sleep deprivation locks resting tachycardia high, narrows coronary fill duration, and blunts heart-rate variability.',
        injuryPrevention:
          'Avoid maximal high-intensity conditioning until two consecutive full sleep cycles restore resting cadence and vagal rebound.',
      },
      tactical: {
        readinessPct: 39,
        recoveryWindow: '36–48 h',
        riskValue: '185 ms',
        tacticalImpact:
          'Peak tactical exertion pushes cardiac output toward ceiling rates where thermal drift and shortened diastole cap sustained work capacity.',
        injuryPrevention:
          'Enforce structured post-effort cooldown and hydration pacing so heart rate recovers by at least 25–30 BPM within the first minute.',
      },
    },
  },
  'knee-cut-load': {
    title: 'ACL, Meniscus & Deceleration Torque',
    riskLabel: 'Cut-Load Lag',
    byProfile: {
      baseline: {
        readinessPct: 93,
        recoveryWindow: '12–16 h',
        riskValue: '+4 ms',
        tacticalImpact:
          'Fresh neuromuscular firing keeps hamstring-quadriceps co-contraction synchronized during hard cuts and single-leg landings.',
        injuryPrevention:
          'Maintain eccentric deceleration mechanics with hip-hinge absorption and controlled knee-over-toe tracking on change of direction.',
      },
      stress: {
        readinessPct: 76,
        recoveryWindow: '20–28 h',
        riskValue: '+19 ms',
        tacticalImpact:
          'Elevated central fatigue begins delaying protective hamstring recruitment, nudging tibiofemoral shear higher on abrupt stops.',
        injuryPrevention:
          'Extend dynamic warm-up with isometric posterior-chain activation before high-speed agility cuts or plyometric load.',
      },
      'sleep-debt': {
        readinessPct: 51,
        recoveryWindow: '36–48 h',
        riskValue: '+38 ms',
        tacticalImpact:
          'Multi-day sleep loss slows proprioceptive stabilization and increases dynamic valgus drift — a primary driver of non-contact ACL trauma.',
        injuryPrevention:
          'Cap unpredictable cutting drills and high-impact plyometrics; substitute controlled bilateral strength work until reaction speed recovers.',
      },
      tactical: {
        readinessPct: 42,
        recoveryWindow: '48–60 h',
        riskValue: '+46 ms',
        tacticalImpact:
          'Maximal lower-limb fatigue under tactical load degrades patellar tracking and exposes meniscus and cruciate fibers to peak shear torque.',
        injuryPrevention:
          'Rotate high-torque field intervals, cue soft multi-joint landings, and schedule eccentric hamstring recovery work post-session.',
      },
    },
  },
  'upper-chain-overuse': {
    title: 'Upper-Chain Overuse & Compensation',
    riskLabel: 'Tendon Load Ratio',
    byProfile: {
      baseline: {
        readinessPct: 94,
        recoveryWindow: '10–14 h',
        riskValue: '0.88×',
        tacticalImpact:
          'Scapular stabilizers and rotator-cuff musculature share torque evenly across the humerus-radius-ulna kinetic chain.',
        injuryPrevention:
          'Keep balanced posterior shoulder endurance and thoracic mobility so overhead or repetitive tasks do not overload elbow tendons.',
      },
      stress: {
        readinessPct: 75,
        recoveryWindow: '18–24 h',
        riskValue: '1.18×',
        tacticalImpact:
          'Sustained workstation or tactical bracing tightens upper trapezius tone, shifting stabilizing load onto distal forearm flexors.',
        injuryPrevention:
          'Reset scapular depression every hour and pair repetitive wrist/elbow load with light external-rotation activation.',
      },
      'sleep-debt': {
        readinessPct: 54,
        recoveryWindow: '32–44 h',
        riskValue: '1.42×',
        tacticalImpact:
          'Impaired overnight collagen repair and postural slump compound rotator-cuff and lateral epicondyle strain across multi-day fatigue.',
        injuryPrevention:
          'Reduce high-velocity throwing or heavy overhead pressing volume by 30–40% and prioritize scapular-wall mobility drills.',
      },
      tactical: {
        readinessPct: 44,
        recoveryWindow: '42–56 h',
        riskValue: '1.58×',
        tacticalImpact:
          'Peak upper-body exertion drives compensatory recruitment across deltoid and forearm chains, elevating acute tendonitis risk.',
        injuryPrevention:
          'Alternate push/pull load blocks and apply slow eccentric wrist and rotator cuff loading during post-effort deload windows.',
      },
    },
  },
  'microfiber-reset': {
    title: 'Micro-Fiber Fatigue & Breath Reset',
    riskLabel: 'Autonomic Reset',
    byProfile: {
      baseline: {
        readinessPct: 96,
        recoveryWindow: '8–12 h',
        riskValue: '3.5 min',
        tacticalImpact:
          'Intact sarcomere cross-bridge cycling and full diaphragmatic excursion allow rapid transition from effort back to baseline.',
        injuryPrevention:
          'Use 2–3 minutes of slow diaphragmatic nasal breathing after sessions to lock in parasympathetic recovery.',
      },
      stress: {
        readinessPct: 77,
        recoveryWindow: '16–22 h',
        riskValue: '8.0 min',
        tacticalImpact:
          'Shallow upper-chest breathing under cognitive stress limits rib-cage expansion and slows clearance of local muscular tension.',
        injuryPrevention:
          'Run 4-4-4-4 tactical box breathing (4s inhale, 4s hold, 4s exhale, 4s hold) to restore full diaphragmatic dome movement.',
      },
      'sleep-debt': {
        readinessPct: 50,
        recoveryWindow: '40–54 h',
        riskValue: '14.5 min',
        tacticalImpact:
          'Interrupted deep-sleep protein synthesis leaves eccentric sarcomere micro-strain unresolved, compounding soreness and stiffness.',
        injuryPrevention:
          'Shift from eccentric overload to low-impact blood-flow work paired with extended 4-second inhale / 8-second exhale pacing.',
      },
      tactical: {
        readinessPct: 41,
        recoveryWindow: '48–64 h',
        riskValue: '18.0 min',
        tacticalImpact:
          'High-output eccentric strain and elevated CO₂ ventilatory drive require deliberate respiratory down-regulation to prevent overreaching.',
        injuryPrevention:
          'Initiate immediate supine or seated diaphragmatic decompression and avoid back-to-back maximal eccentric load days.',
      },
    },
  },
};

export function getTacticalRecoverySnapshot(factorId, profileId = 'sleep-debt') {
  const load = LOAD_STATES[profileId] || LOAD_STATES['sleep-debt'];
  const mod = MODULE_TELEMETRY[factorId];
  if (!mod) return null;

  const entry = mod.byProfile[load.id] || mod.byProfile['sleep-debt'];
  return {
    factorId,
    title: mod.title,
    loadId: load.id,
    loadLabel: `${load.label} · ${load.bpm} BPM`,
    tone: load.tone,
    readinessPct: entry.readinessPct,
    recoveryWindow: entry.recoveryWindow,
    riskLabel: mod.riskLabel,
    riskValue: entry.riskValue,
    tacticalImpact: entry.tacticalImpact,
    injuryPrevention: entry.injuryPrevention,
    meta: `SYNTHETIC REDACTED · ZERO PHI · SYNCED TO ${load.label.toUpperCase()}`,
  };
}
