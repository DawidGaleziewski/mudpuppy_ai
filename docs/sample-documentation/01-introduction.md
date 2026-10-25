# 1. Introduction

## 1.1 Purpose

This document describes the portal `mudpuppy-dashboard-local` as it is, from recorded crawl evidence,
so that a team or an agent could re-create it. It states only what was observed or deduced, with
a confidence label and evidence for every statement; what could not be observed is listed in
[Unknowns](11-unknowns.md).

## 1.2 Scope

The observed portal area: 29 route templates on documented screens.

- `/app`
- `/app/glossary`
- `/app/glossary/wiki`
- `/app/portals/:portal/docs/:key`
- `/app/portals/:portal/processes/:key`
- `/app/portals/:portal/screens/:screen`
- `/app/portals/mudpuppy-dashboard-local/review`
- `/app/portals/new`
- `/app/portals/reference-insurer-local`
- `/app/portals/reference-insurer-local/:param`
- `/app/portals/reference-insurer-local/:param/PRC-001/documentation`
- `/app/portals/reference-insurer-local/changes`
- `/app/portals/reference-insurer-local/docs`
- `/app/portals/reference-insurer-local/docs/sessions/:param`
- `/app/portals/reference-insurer-local/processes`
- `/app/portals/reference-insurer-local/processes/PRC-001/history`
- `/app/portals/reference-insurer-local/review`
- `/app/portals/reference-insurer-local/rules`
- `/app/portals/reference-insurer-local/same-screen`
- `/app/portals/reference-insurer-local/scans`
- `/app/portals/reference-insurer-local/scans/activity`
- `/app/portals/reference-insurer-local/scans/by-process`
- `/app/portals/reference-insurer-local/scans/plan`
- `/app/portals/reference-insurer-local/screens`
- `/app/portals/reference-insurer-local/settings`
- `/app/portals/reference-insurer-local/workbench`
- `/app/scans/:scan`
- `/app/scans/:scan/:tab`
- `/app/search`

## 1.3 Personas

- `BA (map run persona guest)`
- `BA reviewer (map run persona guest)`
- `BA using the console (map run persona guest, no sign-in)`
- `guest`

## 1.4 Sources

Runs read by the analysis sessions that wrote this documentation:

| Run | Mode | Environment | Persona | Date | Status |
| --- | --- | --- | --- | --- | --- |
| `01a1753d-a8da-7000-85d2-b19d666d3587` | map | local-dev | guest | 2026-10-25 | running |

## 1.5 Definitions

Portal terms are defined in the [Glossary](08-glossary.md), in the portal's own language.
Status and confidence labels are explained in the [README](README.md#legend).

## 1.6 Business goals and stakeholders

Not observable. Business goals, stakeholders, responsibilities and a gap analysis (as-is vs. to-be) cannot be seen from the portal and are out of scope for this documentation.
