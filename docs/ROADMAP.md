# Sentinel AI — Build Roadmap

## Architecture (high level)
```
CCTV/Video → [FastAPI AI Service] → detect() → verify() → severity()
                                                              │
React Dashboard  ◄── Socket.IO ──►  Node/Express Backend ◄───┘
      │                                   │
   Leaflet Map                      PostgreSQL
                                          │
                          Resource Engine → Optimization (Hungarian/OR-Tools)
                                          → Route Engine (A*/Dijkstra)
```

## Phases & status
| Phase | Content | Status |
|---|---|---|
| 1 | Requirements + architecture | ✅ done (this doc + schema.sql) |
| 2 | Dataset collection/preprocessing | ⬜ next — see datasets/README.md |
| 3 | YOLO detection + verification | 🟡 pipeline code done (`detection.py`), model not yet trained |
| 4 | Severity/risk ML model | 🟡 engine + fallback done (`severity.py`), model not yet trained |
| 5 | Backend + DB | ⬜ not started |
| 6 | Resource management | ⬜ not started |
| 7 | Response optimization (Hungarian/OR-Tools) | ⬜ not started |
| 8 | Route optimization (A*/Dijkstra) | ⬜ not started |
| 9 | React dashboard + maps | ⬜ not started |
| 10 | Real-time (Socket.IO) | ⬜ not started |
| 11 | Crisis simulation | ⬜ not started |
| 12 | Evaluation + baseline comparison | ⬜ not started |
| 13 | Docs, viva prep, deployment | ⬜ not started |

## Recommended dataset sources (Section 4)
- **Fire/Smoke**: Kaggle "Fire and Smoke Dataset", Roboflow Universe "Fire Detection" (CC licensed subsets)
- **Accident**: Kaggle "Accident Detection from CCTV Footage", Roboflow "Car Crash Dataset"
- **Fallen person**: Le2i Fall Detection Dataset (research use), UR Fall Detection Dataset
- **Crowd anomaly**: UCSD Anomaly Detection Dataset, ShanghaiTech Crowd Counting
- **Road blockage**: subset of COCO (vehicle/debris classes) + custom staged images
- **Custom data**: 50–150 staged/simulated images per class, phone/webcam footage in safe conditions, annotated in Roboflow (YOLO format export)

All sources, licenses, and exact image counts must be logged in `datasets/DATASET_CARD.md` once collected — required for the project report (Section 27/28 evaluation needs this for reproducibility).

## Next build step
Recommended order: finish Phase 2 (dataset folder + a `train_yolo.py` script) so Phase 3's `detection.py` has a real model to load, OR jump to Phase 5 (Node backend + Postgres) so the system is testable end-to-end with the rule-based fallback already in `severity.py`. Tell me which and I'll build it next.
