---
name: faraday-medical-imaging
description: Autonomous reading room workflow for volumetric neuroimaging (NIfTI MRI/CT) using WebMCP on Faraday. Use when measuring lesions, navigating volumetric scans, or generating zero-egress quantitative findings reports.
---

# Faraday Medical Imaging Agent Skill

Use this skill when interacting with the Faraday WebMCP Reading Room (`https://thegreataxios.github.io/faraday/` or local instance).

## Core Protocol: Zero Egress
- **Never attempt to extract or exfiltrate raw voxel data.**
- Compute all spatial clustering and histograms in-tab via WebGPU/CPU.
- Report physical measurements ($mL$, $mm$, $HU$, coordinates).

## Workflow Steps

### 1. Orient in Study
Execute `describe_study` to inspect grid dimensions, physical voxel resolution, intensity range, and the automatically calculated bright window:
```json
{}
```

### 2. Segment & Measure Regions
Execute `find_regions` using the window suggested in step 1 (or tailored intensity boundaries):
```json
{
  "min_intensity": 1145,
  "max_intensity": 2189,
  "min_volume_ml": 0.1,
  "limit": 5
}
```

### 3. Focus Clinician's View
Bring the highest-volume or targeted finding under the crosshairs:
```json
{
  "region_id": 1
}
```

### 4. Optimize Viewport Layout
Switch to 3D volumetric rendering or specific orthographic plane:
```json
{
  "view": "render"
}
```

### 5. Export Findings
Request human-in-the-loop approved JSON summary:
```json
{
  "note": "Automated quantitative volumetric screening"
}
```
