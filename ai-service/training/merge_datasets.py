
import shutil
from pathlib import Path

SENTINEL_CLASSES = ["fire", "smoke", "accident", "fallen_person", "crowd_anomaly", "road_blockage"]

SOURCE_CONFIG = {
    "fire_raw":   {"class_map": {0: "fire"}, "source_filter": None},
    "smoke_raw":  {"class_map": {0: "fire", 1: "smoke"}, "source_filter": None},
    "accident_raw": {"class_map": {0: "accident"}, "source_filter": None},


    "fall_raw": {
        "class_map": {1: "fallen_person", 2: "fallen_person", 4: "fallen_person", 11: "fallen_person"},
        "source_filter": {1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14},
    },


    "crowd_raw":  {"class_map": {0: "crowd_anomaly", 1: "crowd_anomaly", 2: "crowd_anomaly"}, "source_filter": None},

}

RAW_DIR = Path("datasets/raw")
OUT_DIR = Path("datasets/sentinel_dataset")
SPLITS = ["train", "valid", "test"]


def read_label_classes(label_path: Path):
    """Returns the set of original class ids present in a label file."""
    if not label_path.exists():
        return set()
    ids = set()
    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if parts:
                ids.add(int(parts[0]))
    return ids


def remap_label_file(src_label_path: Path, class_map: dict, dst_label_path: Path):
    lines_out = []
    if src_label_path.exists():
        with open(src_label_path) as f:
            for line in f:
                parts = line.strip().split()
                if not parts:
                    continue
                src_cls = int(parts[0])
                if src_cls not in class_map:
                    continue
                our_cls_name = class_map[src_cls]
                our_cls_id = SENTINEL_CLASSES.index(our_cls_name)
                lines_out.append(" ".join([str(our_cls_id)] + parts[1:]))
    dst_label_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dst_label_path, "w") as f:
        f.write("\n".join(lines_out))


def merge():
    for split in SPLITS:
        (OUT_DIR / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT_DIR / split / "labels").mkdir(parents=True, exist_ok=True)

    total_copied = 0
    total_skipped = 0
    for source_name, config in SOURCE_CONFIG.items():
        class_map = config["class_map"]
        source_filter = config.get("source_filter")
        source_path = RAW_DIR / source_name
        if not source_path.exists():
            print(f"[skip] {source_name} not found at {source_path} — download it first")
            continue

        for split in SPLITS:
            img_dir = source_path / split / "images"
            lbl_dir = source_path / split / "labels"
            if not img_dir.exists():
                continue

            for img_file in img_dir.glob("*.*"):
                label_file = lbl_dir / (img_file.stem + ".txt")

                if source_filter is not None:
                    present = read_label_classes(label_file)
                    if not present.intersection(source_filter):
                        total_skipped += 1
                        continue  # this image doesn't contain any class we want — skip entirely

                new_name = f"{source_name}_{img_file.name}"
                shutil.copy(img_file, OUT_DIR / split / "images" / new_name)

                out_label = OUT_DIR / split / "labels" / (Path(new_name).stem + ".txt")
                remap_label_file(label_file, class_map, out_label)
                total_copied += 1

    yaml_content = f"""train: {(OUT_DIR / 'train' / 'images').resolve()}
val: {(OUT_DIR / 'valid' / 'images').resolve()}
test: {(OUT_DIR / 'test' / 'images').resolve()}

nc: {len(SENTINEL_CLASSES)}
names: {SENTINEL_CLASSES}
"""
    with open(OUT_DIR / "data.yaml", "w") as f:
        f.write(yaml_content)

    print(f"\nDone. {total_copied} images merged, {total_skipped} images skipped (didn't match source_filter).")
    print(f"data.yaml written to {OUT_DIR / 'data.yaml'}")


if __name__ == "__main__":
    merge()
