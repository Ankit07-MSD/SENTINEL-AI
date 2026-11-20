# Kaggle retraining route for five YOLO11 classes

This route trains only the classes that have labels in the current merged
dataset: `fire`, `smoke`, `accident`, `fallen_person`, and `crowd_anomaly`.
Road blockage remains available for manual incident reporting and dispatch,
but this detector will not claim to recognize it.

The ready-to-upload Kaggle notebook is
`ai-service/training/kaggle_five_class_retraining.ipynb`.

## Kaggle notebook setup

1. Add the Sentinel dataset as a Kaggle notebook input.
2. Set the accelerator to GPU.
3. Run the cells below in order. They build a new YAML in `/kaggle/working`
   and leave the attached dataset unchanged. The project copy was already
   fully scanned locally; Kaggle performs only a small label sample here,
   avoiding a slow Python open/read loop over tens of thousands of mounted
   label files. Ultralytics will read the labels as part of training.

```python
!pip install -q ultralytics==8.4.140 pyyaml
```

```python
from pathlib import Path
from itertools import islice
import yaml

class_names = ["fire", "smoke", "accident", "fallen_person", "crowd_anomaly"]
source_names = class_names + ["road_blockage"]

# Find the attached Sentinel dataset without depending on its Kaggle slug.
yaml_candidates = list(Path("/kaggle/input").rglob("data.yaml"))
matches = [p for p in yaml_candidates if p.parent.name == "sentinel_dataset"]
if len(matches) != 1:
    raise RuntimeError(f"Expected one sentinel_dataset/data.yaml, found: {matches}")
dataset_root = matches[0].parent

source_data = yaml.safe_load(matches[0].read_text())
if source_data.get("names") != source_names:
    raise RuntimeError(f"Unexpected class order: {source_data.get('names')}")

split_dirs = {"train": "train", "val": "valid", "test": "test"}
for split_name, split_dir in split_dirs.items():
    image_dir = dataset_root / split_dir / "images"
    labels_dir = dataset_root / split_dir / "labels"
    if not image_dir.is_dir() or not labels_dir.is_dir():
        raise FileNotFoundError(f"Missing {split_name} image/label folders")
    samples = list(islice(labels_dir.glob("*.txt"), 8))
    if not samples:
        raise RuntimeError(f"No labels found in {labels_dir}")
    for label in samples:
        for line_number, line in enumerate(label.open(errors="replace"), 1):
            fields = line.split()
            if not fields:
                continue
            if len(fields) != 5:
                raise RuntimeError(f"Malformed YOLO row: {label}:{line_number}")
            class_id = int(fields[0])
            if class_id not in range(5):
                raise RuntimeError(
                    f"Class {class_id} found in {label}:{line_number}; "
                    "review it instead of silently dropping/remapping it."
                )
            box = [float(value) for value in fields[1:]]
            if any(value < 0 or value > 1 for value in box):
                raise RuntimeError(f"Box value outside 0-1: {label}:{line_number}")
    print(f"{split_name}: folders present; checked {len(samples)} sample labels")

kaggle_yaml = Path("/kaggle/working/sentinel_data_5class.yaml")
kaggle_yaml.write_text(yaml.safe_dump({
    "path": str(dataset_root),
    "train": "train/images",
    "val": "valid/images",
    "test": "test/images",
    "nc": 5,
    "names": class_names,
}, sort_keys=False))
print(kaggle_yaml.read_text())
```

```python
import ultralytics
from ultralytics import YOLO

print("Ultralytics:", ultralytics.__version__)
model = YOLO("yolo11n.pt")  # official COCO-pretrained YOLO11 nano weights
train_results = model.train(
    data=str(kaggle_yaml),
    epochs=50,
    imgsz=640,
    batch=16,
    patience=15,
    seed=42,
    device=0,
    project="/kaggle/working/runs/detect",
    name="sentinel_yolo11_5class_v1",
    save_period=5,
)
best_path = Path(model.trainer.best)
print("Best checkpoint:", best_path)
```

Keep the test split out of training and model selection. After training,
evaluate the saved best checkpoint on the test split once:

```python
import shutil
from IPython.display import FileLink, display

if not best_path.exists():
    raise FileNotFoundError(best_path)

best = YOLO(str(best_path))
assert list(best.names.values()) == class_names, best.names
test_metrics = best.val(data=str(kaggle_yaml), split="test", imgsz=640, batch=16, device=0)
print("Precision:", test_metrics.box.mp)
print("Recall:", test_metrics.box.mr)
print("mAP50:", test_metrics.box.map50)
print("mAP50-95:", test_metrics.box.map)

download_path = Path("/kaggle/working/sentinel_yolo11_5class.pt")
shutil.copy2(best_path, download_path)
display(FileLink(str(download_path)))
```

Download `sentinel_yolo11_5class.pt` and put it in `ai-service/models/`.
The service prefers this checkpoint when present. Until then it can load the
existing six-name checkpoint while filtering out the unsupported sixth output.

## What this route does and does not establish

The five-class YAML corrects the known mismatch between the six declared
classes and the five classes represented in the current labels. It does not
guarantee higher accuracy for fallen-person or crowd-anomaly. Their data are
still sparse; collect and label additional examples before claiming improved
performance. Keep the validation metrics from training separate from the
held-out test metrics.
