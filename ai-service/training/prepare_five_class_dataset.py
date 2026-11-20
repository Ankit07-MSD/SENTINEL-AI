"""Validate Sentinel labels and write a portable five-class YOLO data YAML.

The current merged dataset contains no road_blockage annotations. This script
keeps its images and labels untouched, confirms that train/valid/test labels
use only class IDs 0-4, and writes a derived YAML for five-class retraining.
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import yaml


CLASS_NAMES = ["fire", "smoke", "accident", "fallen_person", "crowd_anomaly"]
SOURCE_CLASS_NAMES = CLASS_NAMES + ["road_blockage"]
SPLITS = {"train": "train", "val": "valid", "test": "test"}


def source_names(yaml_path: Path) -> list[str]:
    source = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    names = source.get("names")
    if isinstance(names, dict):
        names = [names[i] for i in sorted(names)]
    if names != SOURCE_CLASS_NAMES:
        raise ValueError(
            f"Expected source names {SOURCE_CLASS_NAMES}, received {names}"
        )
    return names


def validate_split(dataset_root: Path, split_dir: str) -> tuple[int, Counter[int]]:
    label_dir = dataset_root / split_dir / "labels"
    image_dir = dataset_root / split_dir / "images"
    if not label_dir.is_dir() or not image_dir.is_dir():
        raise FileNotFoundError(f"Missing images/labels folders for {split_dir}")

    image_count = sum(1 for p in image_dir.iterdir() if p.is_file())
    counts: Counter[int] = Counter()
    malformed = []
    for label_path in label_dir.glob("*.txt"):
        with label_path.open("r", encoding="utf-8", errors="replace") as stream:
            for line_number, line in enumerate(stream, 1):
                values = line.split()
                if not values:
                    continue
                if len(values) != 5:
                    malformed.append(f"{label_path.name}:{line_number} (expected 5 fields)")
                    continue
                try:
                    class_id = int(values[0])
                    box = [float(v) for v in values[1:]]
                except ValueError:
                    malformed.append(f"{label_path.name}:{line_number} (non-numeric value)")
                    continue
                if not 0 <= class_id < len(CLASS_NAMES):
                    raise ValueError(
                        f"Unsupported class ID {class_id} in {label_path}:{line_number}. "
                        "This five-class route requires IDs 0-4; review the label instead "
                        "of silently remapping it."
                    )
                if any(value < 0 or value > 1 for value in box):
                    malformed.append(f"{label_path.name}:{line_number} (box value outside 0-1)")
                    continue
                counts[class_id] += 1

    if malformed:
        examples = ", ".join(malformed[:5])
        raise ValueError(f"Malformed YOLO rows in {split_dir}: {examples}")
    return image_count, counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    dataset_root = args.dataset_root.expanduser().resolve()
    yaml_path = dataset_root / "data.yaml"
    if not yaml_path.is_file():
        raise FileNotFoundError(f"Missing dataset YAML: {yaml_path}")
    source_names(yaml_path)

    for split_name, split_dir in SPLITS.items():
        image_count, class_counts = validate_split(dataset_root, split_dir)
        formatted = {CLASS_NAMES[i]: class_counts.get(i, 0) for i in range(5)}
        print(f"{split_name}: images={image_count}, instances={sum(class_counts.values())}, classes={formatted}")

    config = {
        "path": dataset_root.as_posix(),
        "train": "train/images",
        "val": "valid/images",
        "test": "test/images",
        "nc": len(CLASS_NAMES),
        "names": CLASS_NAMES,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    print(f"Five-class data YAML written to: {args.output.resolve()}")


if __name__ == "__main__":
    main()
